## What is this

It takes in the `shapes.csv` and queries for the shapefile lat/lngs from Nathan's db (this part could be replaced with some alternative source for the shapefiles, such as the OBA Path Extractor from this org) and then runs a series of procedures to determine the distance along the route at each stop for each stop provided in the `allpts.csv` file. The output is a csv file names `out.csv`. It has three column values: `shape_index`, `stop_id`, `dist`. From this data, you can calculate speed along the route once you determine inferred arrivals and exits from a stop point along the route.


### Run it yourself

This is now a Python tool. You should run it in a virtual environment. Required files are in listed in the `requirements.txt` file. Pip install those. To run, `python parse.py` will do once requirements are installed and the 2 files you need - `shapes.csv` and `pts.csv` are presently in the root file as well. 

Note: the MySQL library has issues installing "normally." In order to install, run the following:
```pip install --allow-external mysql-connector-python mysql-connector-python```

For more on this issue, go here: https://geert.vanderkelen.org/2014/install-mysqlcpy-using-pip/


### Resources

Use the supplied `shapes.csv` file if you are interested in curating your own dataset or the one supplied here is outdated. Currently the `shapes.csv` file should be representative of the current system as of November 16, 2015.



### Queries

Creating the `shapes.csv` file involves the following query:

```
SELECT shape_index
	FROM trips as t 
    INNER JOIN stop_times as st 
		ON t.trip_index = st.trip_index 
    INNER JOIN stops AS s 
 		ON (t.feed_index = s.feed_index 
 			AND st.stop_id = s.stop_id)
	GROUP BY shape_index;
```

Running the query in the past has taken around ~150 seconds. This will return a single column that includes one instance of each of the shape indices you will need. 
