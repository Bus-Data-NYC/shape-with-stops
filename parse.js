var csv = require("fast-csv");

// sql connection
var mysql      = require('mysql');
var credentials = require('./credentials.js');

var connection = mysql.createConnection({
  host     : credentials.host,
  user     : credentials.username,
  password : credentials.password,
  database : credentials.database,
});
connection.connect(function(err){
	if(!err) {
	  console.log("Database is connected, running csv load operation.");
	  run();
	} else {
	  console.log("Error connecting database ...");  
	}
});


function loadCSV (loc, cb) {
	var s = {};
	csv
		.fromPath(loc)
		.on("data", function (data) {
			if (data.length == 4 && data[0] !== 'shape_index') {
				var shape_index = data[0],
						stop_id = data[1],
						stop_lat = data[2],
						stop_lon = data[3];
				if (s[shape_index] == undefined)
					s[shape_index] = [];
				s[shape_index].push({
					'id': stop_id,
					'loc': [stop_lat, stop_lon]
				});
			}
		})
		.on("end", function () {
			cb(s);
		});
};

function getShape (id, cb) {
	var query = 'SELECT shape_pt_lat, shape_pt_lon, shape_pt_sequence FROM shapes WHERE shape_index = ' + id + ';';
	connection.query(query, function (error, rows, fields) {
		if (error) {
			console.log('FAILED MySQL request for route: ', id);
		} else {
			cb(rows);
		}
	});
};

function cleanRows (rs) {
	return rs.map(function (r) {
		return {
			seq: r.shape_pt_sequence,
			loc: [r.shape_pt_lat, r.shape_pt_lon]
		}
	});
};

function loadShapes (s, cb) {
	var sh = {};
	s.forEach(function (k, i) {
		getShape(k, function (r) {
			sh[k] = cleanRows(r);
			if (s.length - 1 == i) {
				cb(sh);
			}
		});
	});
};

function hvrsn (ll1, ll2) {
	function deg2rad (d) {
		r = d * (Math.PI/180);
		return r;
	};

	var dlat = ll2[0] - ll1[0],
			dlon = ll2[1] - ll1[1],
			erad = 6369087,
			alpha = dlat/2,
			beta = dlon/2,

			a = Math.sin(deg2rad(alpha)) * 
					Math.sin(deg2rad(alpha)) + 
					Math.cos(deg2rad(ll1[0])) * 
					Math.cos(deg2rad(ll2[0])) * 
					Math.sin(deg2rad(beta)) * 
					Math.sin(deg2rad(beta)),
			c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)),
			dist =  erad * c;
	return Number(dist.toFixed(6));
};



function run () {
	loadCSV('allpts.csv', function (s) {
		console.log('Loaded all stops; running shape queries.');
		var k = Object.keys(s);
		loadShapes(k, function (sh) {
			console.log('Loaded all shapes; running stop calculations.');
			var st = {};
			k.forEach(function (e) {

				var stop = s[e],
						shape = sh[e];

				shape.sort(function (a, b) {
					return Number(a.seq) - Number(b.seq);
				});
				shape = shape.map(function (a, i) { 
					if (i > 0) {
						var b = shape[i-1];
						a.d = b.d + hvrsn(a.loc, b.loc);
					} else {
						a.d = 0;
					}
					return a;
				});
				
				stop.sort(function (a, b) {
					return Number(a.id) - Number(b.id);
				});				
				stop = stop.map(function (a, ai) {
					var cl = {o: null, d: null};
					shape.forEach(function (b, bi) {
						var d = null;
						if (bi == 0) {
							d = hvrsn(a.loc, b.loc)
						} else {
							d = hvrsn(a.loc, b.loc) + hvrsn(a.loc, shape[bi - 1].loc);
						}
						if (cl.o == null || d < cl.d) {
							cl.o = b;
							cl.d = d;
						}
					});
					if (cl.o !== null) {
						a.d = hvrsn(a.loc, cl.o.loc) + cl.o.d;
					}
					return a;
				});

				console.log(stop);

			});
		});
	});
};




