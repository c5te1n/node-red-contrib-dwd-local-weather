module.exports = function(RED) {
    "use strict";
    const request = require("request"),
        unzipper = require("unzipper"),
        sax = require("sax");

    const MOSMIX_URL = 'https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/{$station}/kml/MOSMIX_L_LATEST_{$station}.kmz';
    const MOSMIX_MAXAGE = 3600 * 1000;

    var weatherForecast = {}; // main data structure to hold weather forecast. See initWeatherForecast()
    initWeatherForecast();
    var nextWeatherUpdate = {}; // Hash: mosmixStation: next update due in unix timestamp ms
    
    const mosmixElementsBase = ['TTT', 'Td', 'FF', 'DD', 'wwP', 'RR1c'];
    var mosmixElements = {};  // Hash: mosmixStation: Array with MOSMIX elements to process;

    function initWeatherForecast(mosmixStation) {
        weatherForecast[mosmixStation] = {
            "description": "",
            "times": []
            // followed by additional fields like 'TTT': Array of forecast values
        };
    }

    function updateWeatherForecastIfOutdated(node) {
        if (!nextWeatherUpdate[node.mosmixStation] || (new Date).getTime() > nextWeatherUpdate[node.mosmixStation]) {
            return updateWeatherForecast(node);
        } else {
            return Promise.resolve();
        }
    }

    function updateWeatherForecast(node) {
        nextWeatherUpdate[node.mosmixStation] = (new Date).getTime() + 600 * 1000; // retry in 10 minutes in case of a failure

        let isInitialized = false;
        let xmlTagStack = [];
        let xmlStreamParser = sax.createStream(true, {
            'trim': true
        });

        xmlStreamParser.onopentag = (tag) => {
            if (!isInitialized) {
                // seems we are getting data => initialize data structures
                initWeatherForecast(node.mosmixStation);
                nextWeatherUpdate[node.mosmixStation] = (new Date).getTime() + MOSMIX_MAXAGE;
                isInitialized = true;
            }
            if (!tag.isSelfClosing) {
                xmlTagStack.push(tag);
            }
        };
        xmlStreamParser.onclosetag = (tag) => {
            xmlTagStack.pop();
        };
        xmlStreamParser.ontext = (text) => {
            if (xmlTagStack.length) {
                var currentTag = xmlTagStack[xmlTagStack.length - 1];
                if (currentTag.name=="kml:description") {
                    weatherForecast[node.mosmixStation]["description"] = text;
                }
                if (currentTag.name=="dwd:TimeStep") {
                    weatherForecast[node.mosmixStation]["times"].push(new Date(text));
                }
                if (xmlTagStack.length >= 2 && currentTag.name=="dwd:value") {
                    var enclosingTag = xmlTagStack[xmlTagStack.length - 2];
                    if (enclosingTag.name=="dwd:Forecast" && enclosingTag.attributes["dwd:elementName"] && mosmixElements[node.mosmixStation].includes(enclosingTag.attributes["dwd:elementName"])) {
                        weatherForecast[node.mosmixStation][enclosingTag.attributes["dwd:elementName"]] = text.split(/\s+/).map(v => Number.parseFloat(v));
                    }
                }
            }
        };

        node.status( {fill:"blue", shape:"dot", text:"dwdweather.status.requesting"} );

        return new Promise((resolve, reject) => {
            //console.log(MOSMIX_URL.replace(/\{\$station\}/g, node.mosmixStation));
            request.get(MOSMIX_URL.replace(/\{\$station\}/g, node.mosmixStation))
                .on('error', reject)
                .on('response', (response) => {
                    if (response.statusCode == 404) {
                        reject(RED._("dwdweather.warn.noDataForStation"));
                    } else if (response.statusCode != 200) {
                        reject(response.statusCode + " " + response.statusMessage);
                    }
                })
                .pipe(unzipper.ParseOne(/\.kml/i))
                .on('error', reject)
                .pipe(xmlStreamParser)
                .on('error', reject)
                .on('end', resolve);
            // end stream
        });
    }

    function getInterpolatedValue(mosmixStation, attribute, forecastDate = null) {
        if (forecastDate===null) {
            forecastDate = new Date();
        }
        if (!weatherForecast[mosmixStation]) {
            throw new Error(RED._("dwdweather.warn.noDataForStation"));
        }
        var idx = weatherForecast[mosmixStation]["times"].findIndex((myDate) => {
            return (myDate > forecastDate);
        });
        if (!weatherForecast[mosmixStation][attribute]) {
            // attribute has not been parsed
            throw new Error(RED._("dwdweather.warn.noattribute", { attribute }));
        };
        if (idx==-1) {
            // no predictions for any future dates found - likely the file is too old
            throw new Error(RED._("dwdweather.warn.nopredictions"));
        } else if (idx==0) {
            // all predictions in file are for the future => return first one
            return weatherForecast[mosmixStation][attribute][0];
        } else {
            // linear interpolation of current temperature
            var share = (forecastDate.getTime() - weatherForecast[mosmixStation].times[idx-1].getTime()) / (weatherForecast[mosmixStation].times[idx].getTime() - weatherForecast[mosmixStation].times[idx-1].getTime());
            return weatherForecast[mosmixStation][attribute][idx-1] + share * (weatherForecast[mosmixStation][attribute][idx] - weatherForecast[mosmixStation][attribute][idx-1]);
        }
    }

    function sumFutureValue(mosmixStation, attribute, hours, forecastDate = null) {
        if (forecastDate===null) {
            forecastDate = new Date();
        }
        if (!weatherForecast[mosmixStation]) {
            throw new Error(RED._("dwdweather.warn.noDataForStation"));
        }
        var idx = weatherForecast[mosmixStation]["times"].findIndex((myDate) => {
            return (myDate > forecastDate);
        });
        if (!weatherForecast[mosmixStation][attribute]) {
            // attribute has not been parsed
            throw new Error(RED._("dwdweather.warn.noattribute", { attribute }));
        };
        if (idx==-1) {
            // no predictions for any future dates found - likely the file is too old
            throw new Error(RED._("dwdweather.warn.nopredictions"));
        } else {
            var sum = 0;
            // sum x future values (x = hours), but not more than length of array
            for (var i = idx; i < weatherForecast[mosmixStation][attribute].length && i < hours + idx; i++) {
                if (!isNaN(weatherForecast[mosmixStation][attribute][i])) {
                    sum = sum + weatherForecast[mosmixStation][attribute][i];
                }
            }
            return sum;
        }
    }

    function getForecastedTemperature(mosmixStation, forecastDate) {
        return Math.round(getTempCelsius(getInterpolatedValue(mosmixStation, "TTT", forecastDate)) * 10) / 10;
    }

    function getTempCelsius(tempK) {
        return tempK - 273.15;
    }

    function getForecastedHumidity(mosmixStation, forecastDate) {
        // calculate relative humidity from Taupunkt and temp in Celsius
        return Math.round(1000 * getSDD(getTempCelsius(getInterpolatedValue(mosmixStation, "Td", forecastDate))) / getSDD(getTempCelsius(getInterpolatedValue(mosmixStation, "TTT", forecastDate)))) / 10;
    }

    function getSDD(tempC) {
        // returns Sättigungsdampfdruck in hPa given a temperature in Celsius
        if (tempC >= 0) {
            return 6.1078 * Math.pow(10, (7.5 * tempC) / (237.3 + tempC));
        } else {
            return 6.1078 * Math.pow(10, (7.6 * tempC) / (240.7 + tempC));
        }
    }

    function DwdWeatherQueryNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        node.repeat = Number(config.repeat) || 0;
        node.mosmixStation = config.mosmixStation;
        node.lookAhead = Number(config.lookAheadHours) * 3600000;
        node.additionalFields = config.additionalFields.split(",").map(v=>v.trim()).filter(v=>(v!=""));
        // mosmixElements = mosmixElementsBase; => removing this as it will lead to problems with multiple nodes with different additional field configs
        if (!mosmixElements[node.mosmixStation]) {
            mosmixElements[node.mosmixStation] = mosmixElementsBase;
        }
        node.additionalFields.forEach(v => {
            if (!mosmixElements[node.mosmixStation].includes(v)) {
                mosmixElements[node.mosmixStation].push(v);
            };
        });

        node.interval_id = null;
        if (node.repeat > 0) {
            node.intervalId = setInterval(function() {
                node.emit("input",{});
            }, node.repeat * 1000);
        }

        node.on('input', function(msg) {
            updateWeatherForecastIfOutdated(node)
            .then(() => {
                if (weatherForecast[node.mosmixStation]) {
                    var forecastDate = new Date();
                    forecastDate.setTime(forecastDate.getTime() + node.lookAhead);
                    try {
                        msg.payload = {
                            "station": weatherForecast[node.mosmixStation].description,
                            "tempc": getForecastedTemperature(node.mosmixStation, forecastDate),
                            "humidity": getForecastedHumidity(node.mosmixStation, forecastDate),
                            "windspeed": Math.round(getInterpolatedValue(node.mosmixStation, "FF", forecastDate) * 10) / 10,
                            "winddirection": Math.round(getInterpolatedValue(node.mosmixStation, "DD", forecastDate) * 10) / 10,
                            "precipitation%": Math.round(getInterpolatedValue(node.mosmixStation, "wwP", forecastDate) * 10) / 10,
                            "precipitationNext24h": Math.round(sumFutureValue(node.mosmixStation, "RR1c", 24, forecastDate) * 10) / 10
                        };
                        node.additionalFields.forEach(field => {
                            var val = getInterpolatedValue(node.mosmixStation, field, forecastDate);
                            if (val!==null) {
                                msg.payload[field] = Math.round(val * 100) / 100;
                            };
                        });
                        node.send(msg);
                    } catch (err) {
                        node.warn(err.message);
                    }
                }
            })
            .catch((message) => {
                node.warn(RED._("dwdweather.warn.requestFailed", { 'error': message }));
            })
            .finally(() => {
                node.status({});
            })
        });


        node.on("close", function() {
            if (node.intervalId !== null) {
                clearInterval(node.intervalId);
            }
            nextWeatherUpdate[node.mosmixStation] = 0;
            delete weatherForecast[node.mosmixStation];
            // initWeatherForecast(node.mosmixStation);
        });

        node.emit("input",{});
    }

    RED.nodes.registerType("dwdweather",DwdWeatherQueryNode);
}