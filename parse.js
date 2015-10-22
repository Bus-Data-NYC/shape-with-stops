var csv = require('fast-csv');
var fs = require('fs')

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
					id: stop_id,
					loc: [Number(stop_lat), Number(stop_lon)]
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
			loc: [Number(r.shape_pt_lat), Number(r.shape_pt_lon)]
		}
	});
};

function loadShapes (k, cb) {
	var sh = {};
	k.forEach(function (s, i) {
		getShape(s, function (r) {
			sh[s] = cleanRows(r);
			if (k.length - 1 == i) {
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

function getAllignedStop (ptB, st, ptA) {
	var sb = hvrsn(st, ptB),
			ba = hvrsn(ptB, ptA),
			as = hvrsn(ptA, st);

	if (ba == 0) {
		return ptA;
	} else {
		var angle = {
					a: Math.acos(((as * as) + (ba * ba) - (sb * sb)) / (2 * ba * as)),
					s: Math.acos(((as * as) + (sb * sb) - (ba * ba)) / (2 * sb * as)),
					b: Math.acos(((sb * sb) + (ba * ba) - (as * as)) / (2 * ba * sb))
				};

		if (angle.a > 90 || angle.b > 90)
			return null;

		angle['s1'] = 90 - angle.b;
		angle['s2'] = 90 - angle.a;

		var v = Math.cos(angle.s2) * as,

				p1 = Math.tan(angle.s1) * v,
				p2 = Math.tan(angle.s2) * v,

				crnr = [ptA[0], ptB[1]],
				genh = hvrsn(ptB, crnr),
				genw = hvrsn(crnr, ptA),
				vecAng = Math.asin(genh/ba),

				delh = Math.sin(vecAng) * p2,
				delw = Math.cos(vecAng) * p2,

				lat = ptA[0] - ((ptA[0] - ptB[0]) * (delh / genh)),
				lon = ptA[1] - ((ptA[1] - ptB[1]) * (delw / genw));

				if (isNaN(lat) || isNaN(lon)) {
					console.log('NaN Err: ', ptB, st, ptA);
					console.log(sb, ba, as);
					console.log('');
				}

				return [lat, lon];
	}
};


function calcShapeLens (shape) {
	return shape.map(function (a, i) { 
		if (i > 0) {
			var b = shape[i-1];
			a.d = b.d + hvrsn(a.loc, b.loc);
		} else {
			a.d = 0;
		}
		return a;
	});
};

function calcStopLens (stop, shape) {
	return stop.map(function (a, ai) {
		var cl = {o: null, a: null, d: null};
		shape.forEach(function (b, bi) {
			var d = null,
					l = null;
			if (bi == 0) {
				d = hvrsn(a.loc, b.loc);
				l = b.loc;
			} else {
				var p = shape[bi - 1];
				d = hvrsn(a.loc, b.loc) + hvrsn(a.loc, p.loc);
				l = getAllignedStop(p.loc, a.loc, b.loc);
			}
			if ((cl.o == null || d < cl.d) && (cl.l !== null)) {
				cl.o = b;
				cl.a = l;
				cl.d = d;
			}
		});
		if (cl.o !== null) {
			a.d = cl.o.d == 0 ? 0 : Number((hvrsn(a.loc, cl.a) + cl.o.d).toFixed(2));
		} else {
			a.d = '\N';
		}
		return a;
	});
};


function stopDistances (k, s, sh, cb) {
	console.log('Here', k);
	var st = {};
	k.forEach(function (e) {
		console.log('Running stop calcs for shp: ' + e)
		var stop = s[e],
				shape = sh[e];
		shape = calcShapeLens(shape);
		stop = calcStopLens(stop, shape);
		st[e] = stop;
	});
	cb(st);
};



function run () {
	loadCSV('allpts.csv', function (s) {
		console.log('Loaded all stops; running shape queries.');
		var k = Object.keys(s);
		loadShapes(k, function (sh) {
			console.log('Loaded all shapes; running stop calculations.');
			stopDistances(k, s, sh, function (st) {
				console.log('Finished stop calculations; running compile.');

				var out = [['shape_index,stop_id,dist']];
				Object.keys(st).forEach(function (k) {
					st[k].forEach(function (e) {
						out.push([k, e.id, e.d].join(','));
					});
				});

				out = out.join('\r\n');
				fs.writeFile("out.csv", out, function (err) {
				  if (err) { return console.log('ERR', err); }
				  console.log("The file was saved!");
				}); 

			});
		});
	});
};




