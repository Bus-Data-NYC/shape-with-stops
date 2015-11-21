from math import radians, cos, sin, asin, sqrt
import mysql.connector
import resource
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

def logOps(msg=None):
	if msg is not None:
		print "\tLogged err: " + str(msg)
	memStr = str(round((float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) / 1000000), 2))
	print "\tCurrent mem usage: " + memStr + " mb."


def structureFetchResult(row):
	d = {
		"loc": (float(row[0]), float(row[1])),
		"id": int(row[2])
	}
	return d


def calculateShapeDistances(shape):
	runningDistanceTally = 0
	for i, pt in enumerate(shape):
		if i == 0:
			shape[i]["d"] = float(0)
		else:
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
	with io.open("allpts.csv", "r") as stream:
		allShapeIDs = list()
		for row in stream:
			row = row.rstrip().split(",")
			if row[0] != "shape_index":
				si = int(row[0])
				if si not in allShapeIDs:
					allShapeIDs.append(si)
	stream.close()
	return allShapeIDs


def getTripsForShape(shape_id):
	with io.open("allpts.csv", "r") as stream:
		trips = dict()

		# sort by trip ids
		for row in stream:
			row = row.rstrip().split(",")
			if row[0] != "shape_index" and int(row[0]) == shape_id:
				tripID = row[2]
				if tripID not in trips:
					trips[tripID] = list()
				trips[tripID].append({
						"seq": int(row[1]),
						"id": int(row[3]),
						"loc": (float(row[4]), float(row[5]))
					})

	# sort each trip by sequence so results in order
	for trip in trips:
		trips[trip] = sorted(trips[trip], key=lambda k: k["seq"], reverse=False)
	stream.close()
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
allShapeIDs = getAllShapeIDs()

# DEBUG
allShapeIDs = [allShapeIDs[9]]
# print allShapeIDs[9]
WTF = 0

for shape_index, shape_id in enumerate(allShapeIDs):
	trips = getTripsForShape(shape_id)
	shape = sqlQuery(shape_id)

	# DEBUG
	trips = {"431": trips["431"]}

	for tripID in trips:
		tripshape = list(shape)
		trip = trips[tripID]

		for stop_i, stop_pt in enumerate(trip):
			minDist = None
			for shape_i, shape_pt in enumerate(tripshape):
				thisDist = None
				if stop_i == 0:
					thisDist = haversine(stop_pt["loc"], shape_pt["loc"])
				else:
					shape_prev = tripshape[shape_i-1]
					thisDist = haversine(stop_pt["loc"], shape_pt["loc"]) + haversine(stop_pt["loc"], shape_prev["loc"])
					thisDist += shape_prev["d"]
				if minDist is None or float(minDist) > thisDist:
					minDist = round(thisDist, 2)
			
			if stop_i > 0:
				trip[stop_i]["d"] = minDist
				if trip[stop_i-1]["d"] > trip[stop_i]["d"]:
					WTF += 1
					print "\nWTF Issue with shape " + str(shape_id) + " and trip id " + str(tripID)
					print stop_i, trip[stop_i], trip[stop_i]["d"]
					print stop_i-1, trip[stop_i-1], trip[stop_i-1]["d"]
			else:
				trip[stop_i]["d"] = minDist

		print "\n-------End of trip--------\n"
		trips[tripID] = trip
		print trips[tripID]

	print "Completed operations for shape_id " + str(shape_id) + " (" + str(shape_index + 1) + "/" + str(len(allShapeIDs)) + ")"
	print WTF


print "Done"
sys.exit()
		

























