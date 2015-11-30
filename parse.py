from math import radians, cos, sin, asin, sqrt
import mysql.connector
import resource
import datetime
import random
import pprint
import io
import json
import sys

# load credentials
creds = None
with open("credentials.json") as c:
	creds = json.load(c)

cnx = mysql.connector.connect(user = creds["username"], 
															host = creds["host"],
															password = creds["password"],
                              database = creds["database"]);



# Utilities

global_start_time = datetime.datetime.now()
def logOps(msg=None):
	current_time = datetime.datetime.now()
	elapsed_time = current_time - global_start_time
	if msg is not None:
		print "Logged: " + str(msg)
	memStr = str(round((float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) / 1000000), 2))
	print "\tCurrent mem usage: " + memStr + " mb.\n\tElapsed time: " + str(elapsed_time)


def structureFetchResult(row):
	d = {
		"loc": (float(row[0]), float(row[1])),
		"id": int(row[2])
	}
	return d


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
	with io.open("data/shapes.csv", "r") as stream:
		allShapeIDs = list()
		for row in stream:
			row = row.rstrip().split(",")
			if row[0] != "shape_index":
				si = int(row[0])
				if si not in allShapeIDs:
					allShapeIDs.append(si)
	stream.close()
	return allShapeIDs


def getTripsSQLQuery(shape_id):
	query = "SELECT st.trip_index, stop_sequence, s.stop_id, stop_lat, stop_lon "
	query += "FROM trips as t INNER JOIN stop_times as st ON t.trip_index = st.trip_index "
	query += "INNER JOIN stops AS s ON (t.feed_index = s.feed_index AND st.stop_id = s.stop_id) "
	query += "WHERE shape_index = " + shape_id + " "
	query += "GROUP BY shape_index, st.trip_index, stop_sequence;"
	
	cursor = cnx.cursor()
	cursor.execute(query)
	return cursor.fetchall()


def getTripsForShape(shape_id):
	stream = getTripsSQLQuery(str(shape_id))
	# with io.open("data/pts.csv", "r") as stream:
	trips = dict()

	# sort by trip ids
	for row in stream:
		if row[0] != "trip_index":
			tripID = row[0]
			if tripID not in trips:
				trips[tripID] = list()
			trips[tripID].append({
					"seq": int(row[1]),
					"id": int(row[2]),
					"loc": (float(row[3]), float(row[4]))
				})

	# sort each trip by sequence so results in order
	for trip in trips:
		trips[trip] = sorted(trips[trip], key=lambda k: k["seq"], reverse=False)
	return trips


def sqlQuery(shape_id):
	cursor = cnx.cursor()
	query = "SELECT shape_pt_lat, shape_pt_lon, shape_pt_sequence FROM shapes WHERE shape_index = " + str(shape_id)
	cursor.execute(query)

	# get results, order by id increasing, and then clean for just lat/lon tuples
	result = map(structureFetchResult, cursor.fetchall())
	result = sorted(result, key=lambda k: k["id"], reverse=False)
	result = calculateShapeDistances(result)
	return result


# Begin streaming the CSV
# line struct: shape_index, stop_sequence, trip_index, stop_id, stop_lat, stop_lon
logOps("Starting the get all shapes stream.")
allShapeIDs = getAllShapeIDs()
logOps("Finished the get all shapes stream.")

output = open('data/out.csv', 'w')
output.write("shape_index,stop_id,dist\n")
output.close()

for shape_index, shape_id in enumerate(allShapeIDs):
	trips = getTripsForShape(shape_id)
	shape = sqlQuery(shape_id)

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
				if closest is None or closest > thisDist:
					closest = thisDist
					if stop_i is 0:
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

			new_line = ",".join([str(shape_index), str(trip[stop_i]["id"]), str(trip[stop_i]["d"])])
			new_line +=  "\n"
			output = open('data/out.csv', 'a')
			output.write(new_line)
			output.close()

	print "Completed operations for shape_id " + str(shape_id) + " (" + str(shape_index + 1) + "/" + str(len(allShapeIDs)) + ")"
	logOps()


print "Done"
sys.exit()
		

























