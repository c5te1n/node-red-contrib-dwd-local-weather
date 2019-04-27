module.exports = function(RED) {
    "use strict";
    const request = require("request"),
        unzipper = require("unzipper"),
        sax = require("sax");

    const MOSMIX_URL = 'https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/{$station}/kml/MOSMIX_L_LATEST_{$station}.kmz';
    const MOSMIX_MAXAGE = 3600 * 1000;

    var weatherForecast;
    initWeatherForecast();
    var nextWeatherUpdate = 0;
    
    var mosmixElements = ['TTT', 'Td', 'FF', 'DD']; // MOSMIX elements to process;

    function initWeatherForecast() {
        weatherForecast = {
            "times": [],
        };
    }

    function updateWeatherForecastIfOutdated(node) {
        if ((new Date).getTime() > nextWeatherUpdate) {
            nextWeatherUpdate = (new Date).getTime() + 600 * 1000; // retry in 10 minutes in case of a failure
            return updateWeatherForecast(node);
        } else {
            return Promise.resolve();
        }
    }

    function updateWeatherForecast(node) {
        var isInitialized = false;
        var xmlTagStack = [];
        var xmlStreamParser = sax.createStream(true, {
            'trim': true
        });

        xmlStreamParser.onopentag = (node) => {
            if (!isInitialized) {
                // seems we are getting data => initialize data structures
                initWeatherForecast();
                nextWeatherUpdate = (new Date).getTime() + MOSMIX_MAXAGE;
                isInitialized = true;
            }
            if (!node.isSelfClosing) {
                xmlTagStack.push(node);
            }
        };
        xmlStreamParser.onclosetag = (node) => {
            xmlTagStack.pop();
        };
        xmlStreamParser.ontext = (text) => {
            if (xmlTagStack.length) {
                var currentTag = xmlTagStack[xmlTagStack.length - 1];
                if (currentTag.name=="dwd:TimeStep") {
                    weatherForecast["times"].push(new Date(text));
                }
                if (xmlTagStack.length >= 2 && currentTag.name=="dwd:value") {
                    var enclosingTag = xmlTagStack[xmlTagStack.length - 2];
                    if (enclosingTag.name=="dwd:Forecast" && enclosingTag.attributes["dwd:elementName"] && mosmixElements.includes(enclosingTag.attributes["dwd:elementName"])) {
                        weatherForecast[enclosingTag.attributes["dwd:elementName"]] = text.split(/\s+/).map(v => Number.parseFloat(v));
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

    function getInterpolatedValue(attribute, forecastDate = null) {
        if (forecastDate===null) {
            forecastDate = new Date();
        }
        var idx = weatherForecast["times"].findIndex((myDate) => {
            return (myDate > forecastDate);
        });
        if (!weatherForecast[attribute]) {
            // attribute has not been parsed
            throw new Error(RED._("dwdweather.warn.noattribute", { attribute }));
        };
        if (idx==-1) {
            // no predictions for any future dates found - likely the file is too old
            throw new Error(RED._("dwdweather.warn.nopredictions"));
        } else if (idx==0) {
            // all predictions in file are for the future => return first one
            return weatherForecast[attribute][0];
        } else {
            // linear interpolation of current temperature
            var share = (forecastDate.getTime() - weatherForecast.times[idx-1].getTime()) / (weatherForecast.times[idx].getTime() - weatherForecast.times[idx-1].getTime());
            return weatherForecast[attribute][idx-1] + share * (weatherForecast[attribute][idx] - weatherForecast[attribute][idx-1]);
        }
    }

    function getForecastedTemperature(forecastDate) {
        return Math.round(getTempCelsius(getInterpolatedValue("TTT", forecastDate)) * 10) / 10;
    }

    function getTempCelsius(tempK) {
        return tempK - 273.15;
    }

    function getForecastedHumidity(forecastDate) {
        // calculate relative humidity from Taupunkt and temp in Celsius
        return Math.round(1000 * getSDD(getTempCelsius(getInterpolatedValue("Td", forecastDate))) / getSDD(getTempCelsius(getInterpolatedValue("TTT", forecastDate)))) / 10;
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

        this.repeat = config.repeat || 0;
        this.mosmixStation = config.mosmixStation;
        this.lookAhead = config.lookAheadHours * 3600000;

        this.interval_id = null;
        if (this.repeat > 0) {
            this.intervalId = setInterval(function() {
                node.emit("input",{});
            }, this.repeat * 1000);
        }

        node.on('input', function(msg) {
            updateWeatherForecastIfOutdated(node)
            .then(() => {
                var forecastDate = new Date();
                forecastDate.setTime(forecastDate.getTime() + this.lookAhead);
                try {
                    msg.payload = {
                        "tempc": getForecastedTemperature(forecastDate),
                        "humidity": getForecastedHumidity(forecastDate),
                        "windspeed": Math.round(getInterpolatedValue("FF", forecastDate) * 10) / 10,
                        "winddirection": Math.round(getInterpolatedValue("DD", forecastDate) * 10) / 10,
                    };
                    node.send(msg);
                } catch (err) {
                    node.warn(err.message);
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
                clearInterval(this.intervalId);
            }
        });
    }

    RED.nodes.registerType("dwdweather",DwdWeatherQueryNode);
}
