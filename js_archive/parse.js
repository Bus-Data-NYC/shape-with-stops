var sqlite3 = require('sqlite3').verbose();
var csv = require('fast-csv');
var fs = require('fs');

// global variables for performance monitoring
var peakStats = {rss: 0, heapTotal: 0, heapUsed: 0};

// sql connection
var mysql = require('mysql');
var credentials = require('./credentials.js');

var connection = mysql.createConnection({
	host     : credentials.host,
	user     : credentials.username,
	password : credentials.password,
	database : credentials.database,
});
connection.connect(function(err){
	if(!err) {
		logOps('Database is connected, running csv load operation.');

		// STEP 1
		loadCSV('allpts.csv', function (s) {
			var k = Object.keys(s); //k = k.slice(0, 100);
			logOps('Loaded all stops (' + k.length + ' total); running shape queries.');

			// STEP 2
			loadShapes(k, function (sh, errors) {
				if (sh == false) {
					console.log('Failed to load all shapes. Errors on the following: ');
					errors.forEach(function (e) {
						console.log(e.id + ': ' + e.error);
					});

				} else {
					logOps('Loaded all shapes (' + Object.keys(sh).length + ' total); running stop calculations.');

					// STEP 3
					stopDistances(k, s, sh, function (st) {
						logOps('Finished stop calculations; running compile.');

						var ns = 0;
						var out = [['shape_index,stop_id,dist']];
						Object.keys(st).forEach(function (k) {
							st[k].forEach(function (e) {
								out.push([k, e.id, e.d].join(','));
								if (isNaN(e.id))
									ns += 1;
							});
						});

						out = out.join('\r\n');
						fs.writeFile("out.csv", out, function (err) {
							connection.end();

							if (err) { return console.log('ERR', err); }
							console.log('All processes completed in ' + dateDiff() + ' minutes. \r\nNaN count: ' + ns);
							// var peakStats = {rss: 0, heapTotal: 0, heapUsed: 0};
							console.log('\r\nPerformance peaks:  \r\n  rss: ' + peakStats.rss + 
																							'\r\n  heapTotal: ' + peakStats.heapTotal + 
																							'\r\n  heapUsed: ' + peakStats.heapUsed + '\r\n');
						}); 

					});
				}
			});
		});

	} else {
		console.log("Error connecting database ...", err);  
	}
});



// STEP 1
function loadCSV (loc, cb) {
	// reassembles csv as large json, each object key is 
	var s = {};

	csv
		.fromPath(loc)
		.on("data", function (data) {
			
			if (Math.random() < 0.0001) logOps();

			if (data.length == 6) {
				var ok = true;
				data.forEach(function (ea) {
					if (isNaN(ea)) ok = false;
				});

				if (ok) {
					// col struct: [shape_index, stop_sequence, st.trip_index, st.stop_id, stop_lat, stop_lon]
					var shape_index = data[0],
							stop_sequence = data[1],
							trip_index = data[2],
							stop_id = data[3],
							stop_lat = data[4],
							stop_lon = data[5];

					if (s[shape_index] == undefined)
						s[shape_index] = {};

					if (s[shape_index][trip_index] == undefined)
						s[shape_index] = [];

					s[shape_index].push({
						id: stop_id,
						seq: stop_sequence,
						loc: [Number(stop_lat), Number(stop_lon)]
					});
				}
			}
		})
		.on("end", function () {
			console.log('Count: ' + ct);

			Object.keys(s).forEach(function (shape) {
				Object.keys(s[shape]).forEach(function (trip) {
					s[shape][trip] = s[shape][trip].sort(compare);
				});
			});
			s = s.sort(compare);
			cb(s);
		});
};

function compare (a, b) {
	a = Number(a.seq);
	b = Number(b.seq);

  if (a < b) return -1;
  else if (a > b) return 1;
  else return 0;
}


// STEP 2
function loadShapes (k, cb) {
	var listErrs = [];
	var sh = {};

	getShape(0);
	function getShape (i) {
		var s = k[i];
		if (i%150 == 0) {
			logOps();
			console.log('    ...querying stop id: ' + s + ' out of ' + (k.length - 1));
		}
		
		var query = 'SELECT shape_pt_lat, shape_pt_lon, shape_pt_sequence FROM shapes WHERE shape_index = ' + s + ';';
		connection.query(query, function (error, rows, fields) {
			if (error) {
				listErrs.push({id: s, error: error});
			} else {
				sh[s] = rows.map(function (r) {
					return {
						seq: r.shape_pt_sequence,
						loc: [Number(r.shape_pt_lat).toFixed(6), Number(r.shape_pt_lon).toFixed(6)]
					}
				});
			}

			// aggressively gc
			error = rows = fields = null;

			// exit on last index
			if (i == (k.length - 1)) {
				if (listErrs.length > 0) {
					cb(false, listErrs);
				}
				cb(sh);
			} else {
				getShape(i+1);
			}
		});
	};
};


// STEP 3
function stopDistances (k, s, sh, cb) {
	var st = {};
	k.forEach(function (e, i) {
		if (i%150 == 0) {
			logOps();
			console.log('    ...running stop calcs for shape id ' + e + '(index #' + i + ' ) out of ' + (k.length - 1));
		}

		var shape = calcShapeLens(sh[e]);
		var stop = calcStopLens(s[e], shape);
		st[e] = stop;
	});
	cb(st);
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
			var d = null;

			if (bi == 0) {
				d = hvrsn(a.loc, b.loc);
			} else {
				var p = shape[bi - 1];
				d = hvrsn(a.loc, b.loc) + hvrsn(a.loc, p.loc);
			}

			if ((cl.o == null || d < cl.d) && (cl.l !== null)) {
				cl.d = d;

				if (bi == 0) {
					cl.a = b.loc;
					cl.o = b;
				} else {
					cl.o = shape[bi - 1];
					cl.a = getAllignedStop(p.loc, a.loc, b.loc);
				}
			}
		});

		if (cl.o !== null) {
			a.d = (cl.o.d == 0 ? 0 : Number((hvrsn(a.loc, cl.a) + cl.o.d).toFixed(2)));
		} else {
			a.d = '\N';
		}
		return a;
	});
};

function hvrsn (ll1, ll2) {
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

function deg2rad (d) {
	return (d * (Math.PI/180));
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

		if (angle.a >= 90 || angle.b >= 90)
			return null;

		angle['s1'] = 90 - angle.b;
		angle['s2'] = 90 - angle.a;

		var v = Math.cos(angle.s2) * as,

				p1 = Math.tan(angle.s1) * v,
				p2 = Math.tan(angle.s2) * v,

				crnr = [ptA[0], ptB[1]],
				genh = hvrsn(ptB, crnr),
				genw = hvrsn(crnr, ptA);

		var vecAng, latrat, lonrat;
		if (genh == 0 && genw !== 0)
			vecAng = Math.asin(genw/ba);
		else if (genh !== 0 && genw == 0)
			vecAng = Math.asin(genh/ba);
		else
			return ptA;

		var delh = Math.sin(vecAng) * p2,
				delw = Math.cos(vecAng) * p2;

		var latrat, lonrat;
		if (genh == 0 && genw !== 0) {
			latrat = 0;
			lonrat = 1;
		}
		else if (genh !== 0 && genw == 0) {
			latrat = 1;
			lonrat = 0;
		}
		else {
			latrat = delh / genh;
			lonrat = delw / genw;
		}

		var lat = ptA[0] - ((ptA[0] - ptB[0]) * latrat),
				lon = ptA[1] - ((ptA[1] - ptB[1]) * lonrat);

		if (isNaN(lat) || isNaN(lon)) {
			console.log('NaN Err: ', vecAng);
			console.log(delh, delw);
			console.log(lat, lon);
			console.log('');
		} else {
			return [lat, lon];
		}
	}
};




// UTILITIES //
function logOps (msg) {
	if (msg !== undefined) console.log(msg + '\r\n\r\n');

	var currMem = process.memoryUsage();
	var pct = null;
	var changes = [];

	if (peakStats.rss < currMem.rss) {
		pct = (((currMem.rss/peakStats.rss) - 1) * 100).toFixed(1).toString() + '%';
		changes.push('rss increased ' + pct + ' from ' + neatNum(peakStats.rss) + ' to ' + neatNum(currMem.rss) + ' MB.');
		peakStats.rss = currMem.rss;
	}

	if (peakStats.heapTotal < currMem.heapTotal) {
		pct = (((currMem.heapTotal/peakStats.heapTotal) - 1) * 100).toFixed(1).toString() + '%';
		changes.push('heapTotal increased ' + pct + ' from ' + neatNum(peakStats.heapTotal) + ' to ' + neatNum(currMem.heapTotal) + ' MB.');
		peakStats.heapTotal = currMem.heapTotal;
	}

	if (peakStats.heapUsed < currMem.heapUsed) {
		pct = (((currMem.heapUsed/peakStats.heapUsed) - 1) * 100).toFixed(1).toString() + '%';
		changes.push('heapUsed increased ' + pct + ' from ' + neatNum(peakStats.heapUsed) + ' to ' + neatNum(currMem.heapUsed) + ' MB.');
		peakStats.heapUsed = currMem.heapUsed;
	}

	if (changes.length > 0) {
		var c = changes.join('\r\n      ');
		console.log('    Current resource changes: \r\n      ' + c + '\r\n');
	}
};

function neatNum (x) {
	x = (x/1000000).toFixed(2);
  var parts = x.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

var startTime = new Date();
function dateDiff (datepart) {
	if (datepart == undefined) datepart = 'm';
	else datepart = datepart.toLowerCase();

	var endTime = new Date();
	var diff = endTime - startTime;
	return (diff/60000).toFixed(2);
};










