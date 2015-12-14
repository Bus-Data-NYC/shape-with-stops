from math import radians, cos, sin, asin, sqrt
import resource
import datetime
import random
import io
import os.path
import json
import sys



# Make Python 2 compliant with FileNotFoundError from Python 3

try:
    FileNotFoundError
except NameError:
    FileNotFoundError = IOError



# Check if all files are accounted for

gtfs_files = ["shapes", "stop_times", "stops", "trips"]
for file_path in gtfs_files:
	file_path = "data/gtfs/" + file_path + ".txt"
	if not os.path.exists(file_path):
		raise FileNotFoundError(str(file_path) + " path missing file.")
gtfs_files = None


# Utilities

global_start_time = datetime.datetime.now()
def logOps(msg=None):
	current_time = datetime.datetime.now()
	elapsed_time = current_time - global_start_time
	if msg != None:
		print "Logged: " + str(msg)
	memStr = str(round((float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) / 1000000), 2))
	print "\tCurrent mem usage: " + memStr + " mb.\n\tElapsed time: " + str(elapsed_time)


def calculateShapeDistances(shape):
	runningDistanceTally = float(0)
	for i, pt in enumerate(shape):
		if i > 0:
			runningDistanceTally += haversine(shape[i]["loc"], shape[i-1]["loc"])
		shape[i]["d"] = round(runningDistanceTally, 2)
	return shape


def haversine(pt1, pt2):
	# unpack latitude/longitude
	lat1, lng1 = pt1
	lat2, lng2 = pt2

	if lat1 == lat2 and lng1 == lng2:
		return float(0)
	else:
		# convert all latitudes/longitudes from decimal degrees to radians
		lat1, lng1, lat2, lng2 = map(radians, (lat1, lng1, lat2, lng2))
		lat = float(lat2) - float(lat1)
		lng = float(lng2) - float(lng1)
		d = sin(lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(lng / 2) ** 2
		h = 2 * 6369087 * asin(sqrt(d))
		return round(h, 2)


def getAllShapeIDs():
	shapes_file = "data/gtfs/shapes.txt"
	col_names = open(shapes_file).readline().rstrip().split(",")
	loc_of_shape_id = col_names.index("shape_id")
	
	with io.open(shapes_file, "r") as stream:
		all_shape_ids = list()
		for row in stream:
			val = row.rstrip().split(",")[loc_of_shape_id]
			if val != "shape_id" and val not in all_shape_ids:
				val = str(val)
				all_shape_ids.append(val)
	stream.close()
	return all_shape_ids


def getTripsForShape(shape_id):
	trips = dict()
	stop_ids = list()

	trips_file = "data/gtfs/trips.txt"
	col_names = open(trips_file).readline().rstrip().split(",")
	loc_of_route_id = col_names.index("route_id")
	loc_of_shape_id = col_names.index("shape_id")
	loc_of_trip_id = col_names.index("trip_id")

	with io.open(trips_file, "r") as stream:
		for row in stream:
			row = row.rstrip().split(",")
			if row[loc_of_route_id] != "route_id":
				if str(row[loc_of_shape_id]) == shape_id:
					trips[str(row[loc_of_trip_id])] = []
	stream.close()

	shapes_times_file = "data/gtfs/stop_times.txt"
	col_names_st = open(shapes_times_file).readline().rstrip().split(",")
	loc_of_stop_id_st = col_names_st.index("stop_id")
	loc_of_stop_sequence_st = col_names_st.index("stop_sequence")
	loc_of_trip_id_st = col_names_st.index("trip_id")
	
	with io.open(shapes_times_file, "r") as stream:
		for row in stream:
			row = row.rstrip().split(",")
			if row[loc_of_trip_id_st] != "trip_id":
				if row[loc_of_trip_id_st] in trips:
					trips[str(row[loc_of_trip_id_st])].append({
							"seq": int(row[loc_of_stop_sequence_st]),
							"id": int(row[loc_of_stop_id_st])
						})
					new_stop_id = int(row[loc_of_stop_id_st])
					if new_stop_id not in stop_ids:
						stop_ids.append(new_stop_id)
	stream.close()

	def addLoc(stop_id, latlng):
		ok = False
		for trip in trips:
			for stop_index, stop in enumerate(trips[trip]):
				if stop["id"] == stop_id:
					latlng = (float(row[3]), float(row[4]))
					trips[trip][stop_index]["loc"] = latlng
					ok = True
		return ok

	stops_file = "data/gtfs/stops.txt"
	col_names_sf = open(stops_file).readline().rstrip().split(",")
	loc_of_stop_id_sf = col_names_sf.index("stop_id")
	loc_of_stop_lat_sf = col_names_sf.index("stop_lat")
	loc_of_stop_lon_sf = col_names_sf.index("stop_lon")

	with io.open(stops_file, "r") as stream:
		for row in stream:
			row = row.rstrip().split(",")
			if row[loc_of_stop_id_sf] != "stop_id":
				stop_id = int(row[loc_of_stop_id_sf])
				if stop_id in stop_ids:
					latlng = (float(row[loc_of_stop_lat_sf]), float(row[loc_of_stop_lon_sf]))
					success = addLoc(stop_id, latlng)
					if success == True:
						stop_ids.remove(stop_id)
					else:
						raise Exception("Stop ID (" + str(stop_id) + ") missing in stops.txt")
	stream.close()

	missing = len(stop_ids)
	if missing == 0:
		# sort each trip by sequence so results in order
		for trip in trips:
			trips[trip] = sorted(trips[trip], key=lambda k: k["seq"], reverse=False)
		return trips
	else:
		raise Exception("Incomplete trip data, " + str(missing) + " bad objects")


def getShape(shape_id):
	shape = list()

	with io.open("data/gtfs/shapes.txt", "r") as stream:
		shape = list()
		for row in stream:
			row = row.rstrip().split(",")
			sh_id = str(row[0])
			if sh_id != "shape_id" and sh_id == shape_id and len(row) == 4:
				shape.append({
						"loc": (float(row[1]), float(row[2])),
						"seq": int(row[3])
					})
	stream.close()

	# order by id increasing
	shape = sorted(shape, key=lambda k: k["seq"], reverse=False)
	shape = calculateShapeDistances(shape)
	return shape





# Begin streaming the CSV
# line struct: shape_index, stop_sequence, trip_index, stop_id, stop_lat, stop_lon
logOps("Starting the get all shapes stream.")
allShapeIDs = getAllShapeIDs()
logOps("Finished the get all shapes stream.")


output = open('data/out.csv', 'w')
output.write("shape_index,stop_id,dist\n")
output.close()

allShapeIDs = allShapeIDs[0:4]
for shape_index, shape_id in enumerate(allShapeIDs):
	trips = getTripsForShape(shape_id)
	shape = getShape(shape_id)
	
	for tripID in trips:
		tripshape = list(shape)
		trip = trips[tripID]

		for stop_i, stop_pt in enumerate(trip):
			minDist = None
			closest = None
			for shape_i, shape_pt in enumerate(tripshape):
				thisDist = None
				if stop_i == 0:
					thisDist = haversine(stop_pt["loc"], shape_pt["loc"])
				else:
					shape_prev = tripshape[shape_i-1]
					thisDist = haversine(stop_pt["loc"], shape_pt["loc"]) + haversine(stop_pt["loc"], shape_prev["loc"])
				if closest == None or closest > thisDist:
					closest = thisDist
					if stop_i == 0:
						minDist = 0
					else:
						minDist = round(shape_prev["d"], 2)
			
			trip[stop_i]["d"] = minDist

			# DEBUG catch "backwards" points
			if stop_i > 0:
				if trip[stop_i-1]["d"] > trip[stop_i]["d"]:
					print "\nIssue with shape " + str(shape_id) + " and trip id " + str(tripID)
					print "Current stop: " + str(stop_i) + str(trip[stop_i]) + str(trip[stop_i]["d"])
					print "Previous stop: " + str(stop_i-1) + str(trip[stop_i-1]) + str(trip[stop_i-1]["d"])

			new_line = ",".join([str(shape_id), str(trip[stop_i]["id"]), str(trip[stop_i]["d"])])
			new_line +=  "\n"
			output = open('data/out.csv', 'a')
			output.write(new_line)
			output.close()

		# Completed a tripID
		trip = None
		tripshape = None

	# Completed trips and shape
	trips = None
	shape = None

	logOps("Completed operations for shape_id " + str(shape_id) + " (" + str(shape_index + 1) + "/" + str(len(allShapeIDs)) + ")")


print "Done"
sys.exit()
		

























