/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
var ENV = (function () {

    var localStorage = window.localStorage;
    var eventHubClient = null;

    var output = {
        settings: {
            /**
             * state-mgmt
             */
            eventHub: {
                eventHubName: localStorage.getItem('eventHubName') || 'driverdemo', //'EventHub Name',
                eventHubNamespace: localStorage.getItem('eventHubNamespace') || 'ericmaitesting', //'EventHub Namespace',
                eventHubSASKey: localStorage.getItem('eventHubSASKey') || '50MnajPCEzPC+rvjq7rlOLRqUAQF5KewtOAlkgMUifo=', //'EventHub SAS Key',
                eventHubSASKeyName: localStorage.getItem('eventHubSASKeyName') || 'SendOnly', //'EventHub SAS Key Name',
                eventHubTimeout: localStorage.getItem('eventHubTimeout') || 10,
            },
            sensors: {
                geolocation: true,
                accelerometer: false,
                compass: false
            },
            beacons: [
            ]
        },
        toggle: function (key) {
            var value = localStorage.getItem(key)
            newValue = ((new String(value)) == 'true') ? 'false' : 'true';

            localStorage.setItem(key, newValue);
            return newValue;
        },
        save: function () {
            // Save settings to local storage
        }
    }

    return output;
})()

var app = {
    /**
     * @property { string } device id
     */
    deviceId: undefined,
    /**
     * @property {leafletjs} map
     */
    map: undefined,
    /**
     * @property {Leafletjs PolyLine} path The list of background geolocations
     */
    path: L.polyline([], 2, {}),
    /**
     * @property {leafletjs layer group} layergroup to keep track of markers and lines.
     */
    mapLayers: undefined,
    /**
     * @property {Geolocation} location The current location
     */
    currentLocation: undefined,
    /**
     * @property {Geolocation} previous location
     */
    previousLocation: undefined,
    /**
     * @property {Array} locations List of rendered map markers of prev locations
     */
    locations: [],
    /**
     * @property { Watch ID} the watch id for location
     */
    locationWatchId: undefined,
    /**
     * @property {Acceleration} the latest acceleration value
     */
    acceleration: undefined,
    /**
     * @property {Watch ID} the watch id for acceleration.
     */
    accelerationWatchId: undefined,
    /**
     * @property {Heading} the latest compass heading value
     */
    heading: undefined,
    /**
      * @property {Watch ID} the watch id for the compass.
      */
    compassWatchId: undefined,
    /**
      * @property {EventHubClient} a client to the eventhub to send data to.
      */
    eventHubClient: undefined,
    /**
     * @property { Interval ID } the interval id of the update to cloud timer
     */
    sendToCloudIntervalId: undefined,
    /**
     * @property { integer } the number of seconds between updates to the cloud
     */
    cloudUpdateInterval: 1,
    /**
      * @property {beacons} a list of beacons we've seen recently.
      */
    beacons: {},
    /**
      * @property {scanInterval} how often to scan for beacons
      */
    scanInterval: 5000,
    /**
      * @property {isScanning} are we currently scanning for beacons
      */
    isScanning: false,
    /**
     * @property {lastScanEvent} when was the last time we scanned for beacons
     */
    lastScanEvent: new Date(),
    /**
     * @property {lastServiceScanEvent} when was the last service scan done
     */
    lastServiceScanEvent: new Date(),

    /**
    * @private
    */
    btnEnabled: undefined,
    btnPace: undefined,
    btnHome: undefined,
    btnReset: undefined,
    configDisplayed: false,

    // Application Constructor  
    initialize: function () {
        if (typeof device !== 'undefined') {
            app.deviceId = device.uuid;
        } else {
            app.deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        this.bindEvents();
        this.renderMapView();
    },
    renderMapView: function () {
        var header = $('#header'),
            footer = $('#footer'),
            canvas = $('#map-canvas'),
            canvasHeight = window.innerHeight - header[0].clientHeight - footer[0].clientHeight;

        canvas.height(canvasHeight);
        canvas.width(window.clientWidth);

        app.map = L.map('map-canvas').setView([51.505, -0.09], 13);
        L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
            attribution: 'Map Data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> | Imagery &copy; <a href="http://mapbox.com">Mapbox</a>',
            maxZoom: 18,
            id: 'irjudson.cig198uj20ph0u6m44n3ltn4z',
            accessToken: 'pk.eyJ1IjoiaXJqdWRzb24iLCJhIjoiY2lnMTk4dzFuMHBhbnV3bHZsMmE0Ym1hcCJ9.LQSOcDk_TOrObpLYB-7_xw'
        }).addTo(app.map);
        app.mapLayers = new L.LayerGroup().addTo(app.map);

        app.map.addControl(new L.Control.Compass());
    },
    renderConfigView: function () {
        var map = $('#map-canvas'),
            config = $('#config'),
            eventHubConfig = ENV.settings.eventHub;

        if (app.configDisplayed) {
            config.hide();
            map.show();
            app.configDisplayed = false;
        } else {
            map.hide();

            // load up current settings
            for (var key in eventHubConfig) {
                var element = $('input#' + key);
                element.val(eventHubConfig[key]);
            }
            for (var key in ENV.settings.sensors) {
                $('input#include-' + key).checked = ENV.settings.sensors[key];
            }
            config.show();
            this.btnConfigSave = $('button#btn-config-save');
            this.btnConfigSave.on('click', function () {
                // read values in to config
                for (var key in eventHubConfig) {
                    eventHubConfig[key] = $('input#' + key).val();
                }

                for (var key in eventHubConfig) {
                    console.log("New Setting: " + key + " => " + eventHubConfig[key]);
                }

                // Connect to the newly configured EventHub
                app.connectToEventHub();

                // Check the sensor toggles       
                if ($('input#include-geolocation').prop('checked')) {
                    // Toggle enable variable
                    ENV.settings.sensors.geolocation = true;
                    // Set timer to update application variable, asyncronously
                } else {
                    ENV.settings.sensors.geolocation = false;
                }

                if ($('input#include-accelerometer').prop('checked')) {
                    // Toggle enable variable
                    ENV.settings.sensors.accelerometer = true;
                } else {
                    ENV.settings.sensors.accelerometer = false;
                }

                if ($('input#include-compass').prop('checked')) {
                    // Toggle enable variable
                    ENV.settings.sensors.compass = true;
                } else {
                    ENV.settings.sensors.compass = false;
                }

                // go back to previous view
                config.hide();
                map.show();
                app.configDisplayed = false;
            });
            this.btnConfigCancel = $('button#btn-config-cancel');
            this.btnConfigCancel.on('click', function () {
                config.hide();
                map.show();
                app.configDisplayed = false;
            });
            app.configDisplayed = true;
        }
    },
    // Bind Event Listeners
    //
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function () {
        document.addEventListener('deviceready', this.onDeviceReady, false);
        document.addEventListener('pause', this.onPause, false);
        document.addEventListener('resume', this.onResume, false);

        // Init UI buttons
        this.btnHome = $('button#btn-home');
        this.btnReset = $('button#btn-reset');
        this.btnPace = $('button#btn-pace');
        this.btnEnabled = $('button#btn-enabled');
        this.btnBeacons = $('button#btn-beacons');
        this.btnConfig = $('button#btn-config');

        if (ENV.settings.sensors.geolocation == true) {
            this.btnEnabled.addClass('btn-danger');
            this.btnEnabled[0].innerHTML = 'Stop';
        } else {
            this.btnEnabled.addClass('btn-success');
            this.btnEnabled[0].innerHTML = 'Start';
        }

        this.btnHome.on('click', this.onClickHome);
        this.btnReset.on('click', this.onClickReset);
        this.btnPace.on('click', this.onClickChangePace);
        this.btnEnabled.on('click', this.onClickToggleEnabled);
        this.btnBeacons.on('click', this.onClickBeacons);
        this.btnConfig.on('click', this.renderConfigView);
    },
    // deviceready Event Handler
    //
    // The scope of 'this' is the event. In order to call the 'receivedEvent'
    // function, we must explicitly call 'app.receivedEvent(...);'
    onDeviceReady: function () {
        app.receivedEvent('deviceready');
        app.connectToEventHub();
        app.configureBackgroundGeoLocation();
        app.startPositionWatch();
        // app.startBLEScan();
        // app.runScanTimer();
        app.map.locate({ setView: true, maxZoom: 16 });
    },
    connectToEventHub: function () {
        console.log("Connecting event hub client.");
        app.eventHubClient = new EventHubClient(
            {
                'name': ENV.settings.eventHub.eventHubName,
                'devicename': app.deviceId,
                'namespace': ENV.settings.eventHub.eventHubNamespace,
                'sasKey': ENV.settings.eventHub.eventHubSASKey,
                'sasKeyName': ENV.settings.eventHub.eventHubSASKeyName,
                'timeOut': ENV.settings.eventHub.eventHubTimeout,
            });
        console.log("Event hub client connected.");
    },
    configureBackgroundGeoLocation: function () {
        var fgGeo = window.navigator.geolocation,
            bgGeo = window.plugins.backgroundGeoLocation;

        app.onClickHome();

        /**
        * This would be your own callback for Ajax-requests after POSTing background geolocation to your server.
        */
        var yourAjaxCallback = function (response) {
            console.log("My callback.");
            bgGeo.finish();
        };

        /**
        * This callback will be executed every time a geolocation is recorded in the background.
        */
        var callbackFn = function (location) {
            console.log('[js] BackgroundGeoLocation callback:  ' + location.latitude + ',' + location.longitude);

            // Update our current-position marker.
            app.updateLocation(location);

            // After you Ajax callback is complete, you MUST signal to the native code, which is running a background-thread, that you're done and it can gracefully kill that thread.
            yourAjaxCallback.call(this);
        };

        var failureFn = function (error) {
            console.log('BackgroundGeoLocation error');
        };

        // Only ios emits this stationary event
        bgGeo.onStationary(function (location) {
            if (!app.stationaryRadius) {
                console.log('iOS emitted a stationary event, we discarded it.');
            }
        });

        // BackgroundGeoLocation is highly configurable.
        bgGeo.configure(callbackFn, failureFn, {
            url: 'http://only.for.android.com/update_location.json', // <-- Android ONLY:  your server url to send locations to
            params: {
                auth_token: 'user_secret_auth_token',    //  <-- Android ONLY:  HTTP POST params sent to your server when persisting locations.
                foo: 'bar'                              //  <-- Android ONLY:  HTTP POST params sent to your server when persisting locations.
            },
            desiredAccuracy: 0,
            stationaryRadius: 50,
            distanceFilter: 50,
            notificationTitle: 'IoT Location Simulator', // <-- android only, customize the title of the notification
            notificationText: 'ENABLED', // <-- android only, customize the text of the notification
            activityType: 'IoTLocationTracking',
            debug: false, // <-- enable this hear sounds for background-geolocation life-cycle.
            stopOnTerminate: true // <-- enable this to clear background location settings when the app terminates
        });

        // Turn ON the background-geolocation system.  The user will be tracked whenever they suspend the app.
        if (ENV.settings.sensors.geolocation == true) {
            bgGeo.start();
        }
    },

    // Run a timer to restart scan in case the device does
    // not automatically perform continuous scan.
    runScanTimer: function () {
        var timeSinceLastScan = new Date() - app.lastScanEvent;
        if (!app.isScanning && timeSinceLastScan > app.scanInterval) {
            console.log("Not scanning and wait delay passed. Let's run this bugger...");
            if (app.scanTimer) {
                console.log("Clearing scan timer.");
                clearTimeout(app.scanTimer);
            }
            console.log("Running startBLEScan...");
            app.startBLEScan(app.callbackFun);
            console.log("(re)Setting scan timer.");
            app.scanTimer = setTimeout(app.runScanTimer, app.scanInterval);
        } else {
            console.log("Didn't start a new scan or reset the timer, it apparently hasn't run yet.");
        }
    },
    // Start bluetooth scanning for beacons
    startBLEScan: function () {
        app.stopBLEScan();

        var timeSinceLastScan = new Date() - app.lastScanEvent;
        console.log("Checking to make sure our delay is honored.");
        if (timeSinceLastScan > app.scanInterval) {
            app.isScanning = true;
            app.lastScanEvent = new Date();

            evothings.ble.startScan(function (newDevice) {
                console.log("Found: " + JSON.stringify(newDevice));
                if (newDevice.address in app.beacons) {
                    return;
                } else {
                    console.log("Found Beacon: " + JSON.stringify(newDevice));
                    if (!(newDevice.address in app.beacons)) {
                        app.stopBLEScan();
                        console.log("Added to app.");
                        app.beacons[newDevice.address] = { deviceInfo: newDevice };
                        evothings.ble.connect(newDevice.address, function (r) {
                            console.log('connect ' + r.deviceHandle + ' state ' + r.state);
                            if (r.state == 2) // connected
                            {
                                console.log('connected, requesting services...');
                                app.getServices(r.deviceHandle);
                            }
                        }, function (errorCode) {
                            console.log('connect error: ' + errorCode);
                        });
                    }
                }
            }, function (errorCode) {
                console.log("Error discovering device.");
            });
        }
        app.scanTimer = setTimeout(app.runScanTimer, app.scanInterval);
    },
    // Stop bluetooth scanning for beacons
    stopBLEScan: function () {
        evothings.ble.stopScan();
        app.isScanning = false;
        clearTimeout(app.scanTimer);
    },
    // For beacons we've found scan for services they run
    getServices: function (deviceHandle) {
        console.log("In getServices!  *************");
        evothings.ble.readAllServiceData(deviceHandle, function (services) {
            console.log("Iterating through Services: ");
            for (var si in services) {
                var s = services[si];
                console.log('s' + s.handle + ': ' + s.type + ' ' + s.uuid + '. ' + s.characteristics.length + ' chars.');

                for (var ci in s.characteristics) {
                    var c = s.characteristics[ci];
                    console.log(' c' + c.handle + ': ' + c.uuid + '. ' + c.descriptors.length + ' desc.');
                    console.log(formatFlags('  properties', c.properties, ble.property));
                    console.log(formatFlags('  writeType', c.writeType, ble.writeType));

                    for (var di in c.descriptors) {
                        var d = c.descriptors[di];
                        console.log('  d' + d.handle + ': ' + d.uuid);

                        // This be the human-readable name of the characteristic.
                        if (d.uuid == "00002901-0000-1000-8000-00805f9b34fb") {
                            var h = d.handle;
                            console.log("rd " + h);
                            // need a function here for the closure, so that variables h, ch, dli retain proper values.
                            // without it, all strings would be added to the last descriptor.
                            function f(h) {
                                ble.readDescriptor(deviceHandle, h, function (data) {
                                    var s = ble.fromUtf8(data);
                                    console.log("rdw " + h + ": " + s);
                                },
                                    function (errorCode) {
                                        console.log("rdf " + h + ": " + errorCode);
                                    });
                            }
                            f(h);
                        }
                    }
                }
            }
            console.log("done.");
        }, function (errorCode) {
            console.log('readAllServiceData error: ' + errorCode);
        });
    },
    onClickBeacons: function () {
        console.log("Clicked beacon button!");
    },
    onClickHome: function () {
        var fgGeo = window.navigator.geolocation;

        if (app.map) {
            // Your app must execute AT LEAST ONE call for the current position via standard Cordova geolocation,
            //  in order to prompt the user for Location permission.
            fgGeo.getCurrentPosition(function (location) {
                var map = app.map,
                    coords = location.coords,
                    zoom = map.getZoom();

                if (zoom < 15) {
                    map.setZoom(15);
                }
                map.panTo([location.latitude, location.longitude]);
                app.updateLocation(location);
            });
        }
    },
    onClickChangePace: function (value) {
        var bgGeo = window.plugins.backgroundGeoLocation,
            btnPace = app.btnPace;

        btnPace.removeClass('btn-success');
        btnPace.removeClass('btn-danger');
    },
    onClickReset: function () {
        // Clear prev location markers.
        app.path = L.polyline([], 2, {});
        app.mapLayers.clearLayers();
        app.location = undefined;
        app.previousLocation = undefined;
        app.currentLocation = undefined;
        app.locations = [];
    },

    onClickToggleEnabled: function (value) {
        var bgGeo = window.plugins.backgroundGeoLocation,
            btnEnabled = app.btnEnabled,
            isEnabled = ENV.toggle('enabled');

        btnEnabled.removeClass('btn-danger');
        btnEnabled.removeClass('btn-success');

        if (isEnabled == 'true') {
            btnEnabled.addClass('btn-danger');
            btnEnabled[0].innerHTML = 'Stop';
            bgGeo.start();
            app.startPositionWatch();
            app.startAccelerometer();
            app.startCompass();
        } else {
            btnEnabled.addClass('btn-success');
            btnEnabled[0].innerHTML = 'Start';
            bgGeo.stop();
            app.stopPositionWatch();
            app.stopAccelerometer();
            app.stopCompass();
        }
    },

    startPositionWatch: function () {
        var fgGeo = window.navigator.geolocation;
        if (app.locationWatchId) {
            app.stopPositionWatch();
        }
        // Watch foreground location
        app.locationWatchId = fgGeo.watchPosition(function (location) {
            app.updateLocation(location.coords);
        }, function () { }, {
            enableHighAccuracy: true,
            maximumAge: 5000,
            frequency: 10000,
            timeout: 10000
        });
    },

    stopPositionWatch: function () {
        var fgGeo = window.navigator.geolocation;
        if (app.locationWatchId) {
            fgGeo.clearWatch(app.locationWatchId);
            app.locationWatchId = undefined;
        }
    },

    startAccelerometer: function () {
        app.accelerationWatchId = window.navigator.accelerometer.watchAcceleration(
            function (acceleration) {
                app.acceleration = acceleration;
            },
            function () {
                console.log("Error capturing acceleration.");
            }, {});
    },
    stopAccelerometer: function () {
        window.navigator.accelerometer.clearWatch(app.accelerationWatchId);
        app.accelerationWatchId = undefined;
    },

    startCompass: function () {
        app.compassWatchID = window.navigator.compass.watchHeading(
            function (heading) {
                app.heading = heading;
            },
            function () {
                console.log("Error reading compass.");
            });
    },
    stopCompass: function () {
        window.navigator.compass.clearWatch(app.compassWatchId);
        app.compassWatchId = undefined;
    },

    onOnline: function () {
        app.map.locate({ setView: true, maxZoom: 16 });
    },

    /**
    * Cordova foreground geolocation watch has no stop/start detection or scaled distance-filtering to conserve HTTP requests based upon speed.  
    * You can't leave Cordova's GeoLocation running in background or it'll kill your battery.  This is the purpose of BackgroundGeoLocation:  to intelligently 
    * determine start/stop of device.
    */
    onPause: function () {
        console.log('- onPause');
        app.stopPositionWatch();
    },
    /**
    * Once in foreground, re-engage foreground geolocation watch with standard Cordova GeoLocation api
    */
    onResume: function () {
        console.log('- onResume');
        app.map.locate({ setView: true, maxZoom: 16 });
        app.startPositionWatch();
    },
    // Update DOM on a Received Event
    receivedEvent: function (id) {
        console.log('Received Event: ' + id);
    },
    sendToCloud: function () {
        // Send to eventhub
        if (this.eventHubClient) {
            console.log("Sending location: " + app.currentLocation + " to eventhub.");

            var eventBody = {
                Timestamp: new Date(),
                UserID: app.deviceId
            };
            if (ENV.settings.sensors.geolocation && app.currentLocation) {
                eventBody['Latitude'] = app.currentLocation.latitude;
                eventBody['Longitude'] = app.currentLocation.longitude;
            }

            if (ENV.settings.sensors.accelerometer && app.acceleration) {
                eventBody['Accleration_X'] = app.acceleration.x;
                eventBody['Accleration_Y'] = app.acceleration.y;
                eventBody['Accleration_Z'] = app.acceleration.z;
            }

            if (ENV.settings.sensors.compass && app.heading) {
                eventBody['MagneticHeading'] = app.heading.magneticHeading;
                eventBody['TrueHeading'] = app.heading.trueHeading;
                eventBody['HeadingAccuracy'] = app.heading.headingAccuracy;
            }

            var msg = new EventData(eventBody);

            app.eventHubClient.sendMessage(msg, function (messagingResult) {
                console.log("Sent location, result: " + messagingResult.result);
            });
        } else {
            console.log("EventHub Client not connected. Please reconfigure your eventhub settings.");
        }
    },

    updateLocation: function (location) {
        console.log('Called updateLocation');

        if (!app.mapLayers) {
            return;
        }

        var latlng = [location.latitude, location.longitude];
        if (!app.location) {
            app.location = L.circle(latlng, 5, {
                color: 'red',
                stroke: false,
                fillOpacity: 1.0
            });
            app.mapLayers.addLayer(app.location);

            app.locationAccuracy = L.circle(latlng, 10, {
                color: 'green',
                fill: false
            });
            app.mapLayers.addLayer(app.locationAccuracy);
        } else {
            app.location.setLatLng(latlng);
            app.locationAccuracy.setLatLng(latlng);
            app.locationAccuracy.setRadius(location.accuracy);
        }

        // Add a track of our history
        if (!app.path) {
            app.path = L.polyline([latlng], 2, {});
        } else {
            app.path.addLatLng(latlng);
        }
        app.mapLayers.addLayer(app.path);

        // Drop a breadcrumb (along the track) of where we've been.
        if (app.currentLocation) {
            app.mapLayers.addLayer(L.circle([app.currentLocation.latitude, app.currentLocation.longitude], 3, {
                color: 'red',
                fillOpacity: 0.5,
                fill: true,
                stroke: false
            }));
        }

        // Update our current position marker and accuracy bubble.
        // If we're near an edge of the screen, we should probably zoom out (panning is visually disruptive)
        app.map.panTo(latlng);
        app.previousLocation = app.currentLocation;
        app.currentLocation = location;
        this.sendToCloud();
    }
};

app.initialize();