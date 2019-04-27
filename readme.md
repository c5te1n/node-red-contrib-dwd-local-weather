# node-red-contrib-dwd-local-weather

A node red node that returns German DWD MOSMIX current / forecasted weather for a given location.

__This node is only useful if you are interested in weather data for Germany.__

The weather data is provided by DWD (Deutscher Wetterdienst, Frankfurter Straße 135, 63067 Offenbach)
See: https://isabel.dwd.de/DE/leistungen/opendata/opendata.html

#### `msg` Attribute

* `payload.tempc` - Temperature in °C
* `payload.humidity` -  Relative humidity
* `payload.windspeed` - Windspeed in m/s
* `payload.winddirection` - Winddirection in °

## License

Apache 2.0 (c) Christian Stein