import mysql.connector
import json

# load credentials
creds = None
with open("credentials.json") as c:
	creds = json.load(c)

cnx = mysql.connector.connect(user = creds["username"], 
															host = creds["host"],
															password = creds["password"],
                              database = creds["database"]);

try:
	cursor = cnx.cursor()
	cursor.execute("""
		SELECT shape_pt_lat, shape_pt_lon, shape_pt_sequence FROM shapes WHERE shape_index = 23
	""")
	result = cursor.fetchall()
	print len(result)

finally:
	print "foo"

import io



peakStats = {
	"rss": 0, 
	"heapTotal": 0, 
	"heapUsed": 0
}

ct = 0

with io.open('allpts.csv', 'r') as file:
	for line in file:
		ct += 1

print ct