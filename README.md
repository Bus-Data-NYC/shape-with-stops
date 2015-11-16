## What is this

It takes in the `allpts.csv` and queries for the shapefile lat/lngs from Nathan's db (this part could be replaced with some alternative source for the shapefiles, such as the OBA Path Extractor from this org) and then runs a series of procedures to determine the distance along the route at each stop for each stop provided in the `allpts.csv` file. The output is a csv file names `out.csv`. It has three column values: `shape_index`, `stop_id`, `dist`. From this data, you can calculate speed along the route once you determine inferred arrivals and exits from a stop point along the route.


### Run it yourself

Just make sure to `npm install` the `package.json` dependencies.


### Resources

Use the supplied `allpts.csv` file if you are interested in curating your own dataset or the one supplied here is outdated. Currently the `allpts.csv` file should be representative of the current system as of November 16, 2015.