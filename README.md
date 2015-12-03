## What is this

This is a tool that takes an unzupped GTFS folder and returns the following a csv called `out.csv` that contains the following columns: `shape_index`, `stop_id`, `dist`.

The purpose of this tool is to calculate the distance along the route that each stop is at, by shape index and stop_id. The output csv is placed in the `data/` folder. Why create this tool? From this data, you can calculate speed along the route once you determine inferred arrivals and exits from a stop point along the route.


### How to run

This is now a Python tool (originally a Node tool, for those following along). You should run it in a virtual environment. Required files are in listed in the `requirements.txt` file. Pip install those (there currently are no outside requirements for the basic version of this tool, there are additional required libraries outside of the ones packaged with Python in the customized version of this built to work with Nathan9's MySQL database). To run, `python parse.py` will do once requirements are installed. 

In order for the tool to work, load the GTFS folder, unzipped, into the `data/` folder such that `./data/gtfs/*.txt`. In order for the tool to work, the following files must be present in their `.txt` form: "shapes", "stop_times", "stops", "trips." If any of those are not present, or any of the files are not in standard GTFS format, this tool will either error or produce incorrect results.

Note: If you are using the customized version of `parse.py` (currently under `parse_custom.py`), the MySQL library has issues installing "normally." In order to install, run the following:
```pip install --allow-external mysql-connector-python mysql-connector-python```

For more on this issue, go here: https://geert.vanderkelen.org/2014/install-mysqlcpy-using-pip/. Also note that you may have to run this with `sudo` (so: `sudo pip install ...`).


### Resources

No outside resources are necessary, aside from the GTFS folder, unzipped which needs to be placed in the root directory's `data/` folder such that, from `root`, `./data/gtfs/*.txt`.

Want an example GTFS feed to start with? Try New York City's MTA GTFS, located: http://web.mta.info/developers/developer-data-terms.html#data. There are 5 GTFS zip files, one for each borough. To create the stop distances, you will need to download each of the 5 and run this on each of them, separately (or write a simple script to chain all of them together, up to you - I kept it out of this to enable this to be used for any standard GTFS unzipped file).

If using the custom version of the tool:
Use the supplied `shapes.csv` file (ONLY for the custom version of the tool) if you are interested in curating your own dataset or the one supplied here is outdated. Currently the `shapes.csv` file should be representative of the current system as of November 16, 2015.



### Queries

Note: This only applied to the version customized to Nathan9's MySQL DB.
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
