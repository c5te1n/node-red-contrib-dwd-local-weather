# node-red-contrib-dwd-local-weather

A node red node that returns German DWD MOSMIX current / forecasted weather for a given location.

It gives you the following data:
- Temperature in °C (in a 2 m height)
- Minimal temperature in °C (in a 2 m height) in the next 24 hours
- Maximum temperature in °C (in a 2 m height) in the next 24 hours
- Relative humidity in %
- Windspeed in m/s (in a 10 m height)
- Wind direction in degrees
- Rain probability in %
- Expected rain amount (precipitation) for the next 24 hours in kg/m<sup>2</sup>
- Timestamp of the forecast

![node-appearance](images/node-appearance.png "Node appearance")  
**Fig. 1:** Node appearance


__Remark__: This node is mainly useful if you are interested in weather data for **Germany**.   International weather data is available for only a couple of **european locations** (see MOSMIX stations below). Examples for international locations are Bergen, London, Dublin, Brussels, Luzern, Lille, Locarno, Le Mans, Madrid, Ibiza, Klagenfurt (and many others).

The weather data is provided by DWD (Deutscher Wetterdienst, Frankfurter Straße 135, 63067 Offenbach).

References:
- https://isabel.dwd.de/DE/leistungen/opendata/opendata.html
- https://www.dwd.de/DE/leistungen/met_verfahren_mosmix/met_verfahren_mosmix.html
- https://www.dwd.de/DE/leistungen/met_verfahren_mosmix/faq/faq_mosmix_node.html
- https://www.dwd.de/DE/leistungen/opendata/help/schluessel_datenformate/kml/mosmix_elemente_xls.html


<a name="installation"></a>
## Installation

<a name="installation_in_node-red"></a>
### In Node-RED (preferred)
* Via Manage Palette -> Search for "node-red-contrib-dwd-local-weather"

<a name="installation_in_a_shell"></a>
### In a shell
* go to the Node-RED installation folder, e.g.: `~/.node-red`
* run `npm install node-red-contrib-dwd-local-weather`

<a name="usage"></a>
## Usage
The easiest usage of the node is using internal triggering:

![basic-usage](images/basic-usage.png "Node usage")  
[**BasicUsageFlow.json**](examples/BasicUsageFlow.json )  

**Fig. 2:** Basic node usage

In this example the node cyclically reads out the DWD data and emits it as an output `msg`.


<a name="node_configuration"></a>
### Node Configuration

![node-settings](images/node-settings.png "Node properties")  
**Fig. 3:** Node properties

Node configuration is quite simple. Only setting the property ***MOSMIX Station*** to select the required weather forecast location is mandatory.

#### MOSMIX station
Set this property to select the weather forecast location.  
The format is a 5 character ***id***. Allowed ids are given in the [stations catalog (in CFG file format)](https://www.dwd.de/DE/leistungen/met_verfahren_mosmix/mosmix_stationskatalog.cfg) of the DWD (german weather service): See coloumn 'id' and search for your location.

Examples:
- id = **10389** for Berlin, Alexanderplatz
- id = **K1174** for Heinsberg (NRW)
- id = **K4476** for Tirschenreuth (BY)


#### Look ahead Hours
Hours to look ahead into the future. Use 0 to get actual weather.

When you set *Look ahead hours*, the weather data returned will be for x hours in the future. If you look at the temperature for 12 hours ahead for example, you should see a different number returned unless that temperature happens to be exactly the same to the actual temperature.

Note: This configuration property is superseeded by an input `msg` with a  `msg.payload.lookAheadHours` element (see secion *Input* below).



#### Omit message on start
For compatibility with the openweathermap node, this node emits a message with current weather data immediately once the flow is deployed. If this is not desirable, it can be deactivated here. In any case, the node will emit a message after the repeat cycle in case this is set (see below) or once it is triggered by receiving a message.


#### Repeat
Automatic cyclic repeat (in seconds). If set to a value > 0, the node automatically repeats the DWD data query and emits a `msg` telegram at its output.

Hint: Do not set this value too small to avoid unneccesary traffic. Appropriate repeat intervals are several minutes due to the weather data does not change at a higher rate than 15-20 seconds, typically one minute.

#### Additional fields
##### Basics
With the *Additional fields* property you can add further weather data to `msg.payload`.    
Possible elements can be selected from this [MOSMIX element list](https://www.dwd.de/DE/leistungen/opendata/help/schluessel_datenformate/kml/mosmix_elemente_xls.html) from the DWD.  
Several elements can be selected and have to be comma-separated.

##### Output modifiers
The data provided by DWD is on an hourly basis. By default, output values will be linearly interpolated. Some data fields such as "SunD" (Yesterdays total sunshine duration) in the below example are only provided once every X hours or even once per day and interpolation does not make sense. With modifiers you can change how the output value is calculated in those cases. When not specifying a modifier, the value for those fields will be 'NaN' in most cases.

Output modifiers are added as a prefix to the field name. So instead of just using "SunD", you would use ">SunD" to return today's predicted total sunshine duration.

Available modifiers:
 - `<` go back in time to find the last value for this field
 - `>` go ahead in time to find the next value for this field
 - `°` assume the field value is a temperature and convert it from Kelvin to Celsius

See also: Node issue ["NaN error with precipitation 24h and 3h"](https://github.com/c5te1n/node-red-contrib-dwd-local-weather/issues/18).

##### Example
The following figure shows the `msg.payload` structure of an example with "FF,FX1,>SunD,SunD1,R101,°Td,VV,W1W2,wwTd":

![additional-fields](images/additional-fields.png "Additional fields")  
**Fig. 4:** *Additional fields* example `msg.payload` contents

##### MOSMIX elements used by the node
The following MOSMIX elements are used as the basis for the node's `msg.payload` values:
- `payload.tempc`:  "TTT"
- `payload.tempc_min_next24h`:  "TTT"
- `payload.tempc_max_next24h`:  "TTT"
- `payload.humidity`: "Td" and "TTT"
- `payload.windspeed`: "FF"
- `payload.winddirection`: "DD"
- `payload.precipitation_perc`: "wwP"
- `payload.precipitationNext24h`: "RR1c"

#### Name
A name for the wheather location may be set via this property.

#### Topic
Allows to configure the topic for emitted messages.

### Input
The node is triggered by any input `msg` with arbitrary contents.

If the input `msg` contains the element `msg.payload.lookAheadHours` its value superseeds the *Look ahead Hours* node configuration property.

### Outputs
The node emits a `msg` whenever it is triggered by an input `msg` or at the configured *Repeat* interval (see node configuration above).

The default `msg` attributes are:
* `payload.station` - Description (location) of the station
* `payload.tempc` - Temperature in °C
* `payload.tempc_min_next24h` - Minimal temperature in °C in next 24 hours
* `payload.tempc_max_next24h` - Maximun temperature in °C in next 24 hours
* `payload.humidity` -  Relative humidity
* `payload.windspeed` - Windspeed in m/s
* `payload.winddirection` - Winddirection in °
* `payload.precipitation_perc` - probability of rain in per cent (so a value of 4 means 4%)
* `payload.precipitationNext24h` - total precipitation in the next 24 hours in kg/m2
* `payload.forecast_dt` - epoch timestamp of the forecast
* `payload.precipitation%` - DEPRECATED, same as `payload.precipitation_perc`

In case of a value set to the node configuration property *Topic* the output `msg` contains an additional attribute `msg.topic` with the set content in addition to the `msg.payload` object.  
As an example, if the node configuration property *Topic* is set to "myTopic" the output `msg` looks like this:

![output-topic-example](images/output-topic-example.png "Output topic example")  

**Fig. 5:** Example output `msg` with topic configuration property set to "myTopic"

## Examples
***
**Remark**: Example flows are present in the examples subdirectory. In Node-RED they can be imported via the import function and then selecting *Examples* in the vertical tab menue.
***

### Basic example
This example shows how to trigger the node and how to evaluate the `msg.payload.tempc` element.

![basic-example](images/basic-example.png "Basic example")  
[**BasicExampleFlow.json**](examples/BasicExampleFlow.json)  

**Fig. 6:** Basic example flow

<details>
  <summary>Click to expand code snippet of the flow</summary>

```javascript
[{"id":"c9a4786f.ee8328","type":"inject","z":"c1f84551.fa0b5","name":"","props":[{"p":"payload"}],"repeat":"","crontab":"","once":false,"onceDelay":0.1,"topic":"","payload":"","payloadType":"str","x":210,"y":1320,"wires":[["63c7e662.9ec0c8"]]},{"id":"63c7e662.9ec0c8","type":"dwdweather","z":"c1f84551.fa0b5","name":"Berlin, Alex","mosmixStation":"10389","lookAheadHours":"0","additionalFields":"","repeat":"0","x":390,"y":1320,"wires":[["52b1bc57.f3fe74","7a6b8898.d8d578"]]},{"id":"52b1bc57.f3fe74","type":"debug","z":"c1f84551.fa0b5","name":"Temperatur in °C","active":true,"tosidebar":false,"console":false,"tostatus":true,"complete":"payload.tempc","targetType":"msg","statusVal":"payload.windspeed","statusType":"auto","x":610,"y":1320,"wires":[]},{"id":"7a6b8898.d8d578","type":"debug","z":"c1f84551.fa0b5","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","statusVal":"","statusType":"auto","x":570,"y":1280,"wires":[]}]
```
</details>


### Example using *Additional fields*


The configuration of the property *Additional fields* was set to "FX1,SunD1,VV". Therefore the elements `msg.payload.FX1` (max. wind gust in the lasts hour), `msg.payload.SunD1` (sunshine duration in the last hour) and `msg.payload.VV` (visibility) appear additionally at the output.  

![additionalfields-example](images/additionalfields-example.png "Additional fields example")  

[**AdditionalFieldsExampleFlow.json**](examples/AdditionalFieldsExampleFlow.json)  
**Fig. 7:** Example with *Additional fields* flow

<details>
  <summary>Click to expand code snippet of the flow</summary>

```javascript
[{"id":"6b9dad75.8e1cfc","type":"dwdweather","z":"c1f84551.fa0b5","name":"Berlin, Alex","mosmixStation":"10389","lookAheadHours":"0","additionalFields":"FX1,SunD1,VV","repeat":"0","x":390,"y":1680,"wires":[["98ed4e40.07d5","e5ef0089.cf48","69ba80bb.54cfc","36980239.12325e","b21cfb33.0eb55","47c88c29.1cea44","5a984276.9804c4"]]},{"id":"9e5e1177.58e82","type":"inject","z":"c1f84551.fa0b5","name":"","props":[{"p":"payload"}],"repeat":"","crontab":"","once":false,"onceDelay":0.1,"topic":"","payload":"","payloadType":"str","x":190,"y":1680,"wires":[["6b9dad75.8e1cfc"]]},{"id":"98ed4e40.07d5","type":"debug","z":"c1f84551.fa0b5","name":"windspeed in m/s","active":true,"tosidebar":false,"console":false,"tostatus":true,"complete":"payload.windspeed","targetType":"msg","statusVal":"payload.windspeed","statusType":"auto","x":730,"y":1800,"wires":[]},{"id":"e5ef0089.cf48","type":"debug","z":"c1f84551.fa0b5","name":"wind direction in °","active":true,"tosidebar":false,"console":false,"tostatus":true,"complete":"payload.winddirection","targetType":"msg","statusVal":"payload.windspeed","statusType":"auto","x":740,"y":1860,"wires":[]},{"id":"69ba80bb.54cfc","type":"debug","z":"c1f84551.fa0b5","name":"max. wind gust last hour","active":true,"tosidebar":false,"console":false,"tostatus":true,"complete":"payload.FX1","targetType":"msg","statusVal":"payload.windspeed","statusType":"auto","x":760,"y":1920,"wires":[]},{"id":"47c88c29.1cea44","type":"debug","z":"c1f84551.fa0b5","name":"sunshine duration last hour in seconds","active":true,"tosidebar":false,"console":false,"tostatus":true,"complete":"payload.SunD1","targetType":"msg","statusVal":"payload.windspeed","statusType":"auto","x":810,"y":1980,"wires":[]},{"id":"b21cfb33.0eb55","type":"debug","z":"c1f84551.fa0b5","name":"rel. humidity in %","active":true,"tosidebar":false,"console":false,"tostatus":true,"complete":"payload.humidity","targetType":"msg","statusVal":"payload.windspeed","statusType":"auto","x":730,"y":1740,"wires":[]},{"id":"36980239.12325e","type":"debug","z":"c1f84551.fa0b5","name":"temperature in °C","active":true,"tosidebar":false,"console":false,"tostatus":true,"complete":"payload.tempc","targetType":"msg","statusVal":"payload.windspeed","statusType":"auto","x":740,"y":1680,"wires":[]},{"id":"5a984276.9804c4","type":"debug","z":"c1f84551.fa0b5","name":"visibility in m","active":true,"tosidebar":false,"console":false,"tostatus":true,"complete":"payload.VV","targetType":"msg","statusVal":"payload.windspeed","statusType":"auto","x":720,"y":2040,"wires":[]}]
```
</details>

<br>

Note that often the values have to be scaled to have more 'handy' values.



## License

Apache 2.0 (c) Christian Stein
