var QMotion = require('qmotion');
var http = require('http');

var Characteristic, PlatformAccessory, Service, UUIDGen;

module.exports = function(homebridge) {
    PlatformAccessory = homebridge.platformAccessory;

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-qmotion", "QMotion", QMotionPlatform, true);
};

function QMotionPlatform(log, config, api) {
    this.config = config || {};

    var self = this;

    this.api = api;
    this.accessories = {};
    this.log = log;

    this.requestServer = http.createServer();

    this.requestServer.on('error', function(err) {

    });

    this.requestServer.listen(18092, function() {
        self.log("Server Listening...");
    });

    this.api.on('didFinishLaunching', function() {
        var client = QMotion.search();

        client.on("found", function(device) {
            device.on("blind", function(blind) {
                var uuid = UUIDGen.generate(blind.addr);
                var accessory = self.accessories[uuid];

                if (accessory === undefined) {
                    self.addAccessory(blind);
                }
                else {
                    self.log("Online: %s [%s]", accessory.displayName, blind.addr);
                    self.accessories[uuid] = new QMotionAccessory(self.log, (accessory instanceof QMotionAccessory ? accessory.accessory : accessory), blind);
                }
            });
        });
    }.bind(this));
}

QMotionPlatform.prototype.addAccessory = function(blind) {
    this.log("Found: %s [%s]", blind.name, blind.addr);

    var accessory = new PlatformAccessory("QMotion " + blind.addr, UUIDGen.generate(blind.addr));
    accessory.addService(Service.WindowCovering, blind.name);
    this.accessories[accessory.UUID] = new QMotionAccessory(this.log, accessory, blind);

    this.api.registerPlatformAccessories("homebridge-qmotion", "QMotion", [accessory]);
}

QMotionPlatform.prototype.configureAccessory = function(accessory) {
    this.accessories[accessory.UUID] = accessory;
}

QMotionPlatform.prototype.configurationRequestHandler = function(context, request, callback) {
    var respDict = {};

    if (request && request.type === "Terminate") {
        context.onScreen = null;
    }

    var sortAccessories = function() {
        context.sortedAccessories = Object.keys(self.accessories).map(
            function(k){return this[k] instanceof PlatformAccessory ? this[k] : this[k].accessory},
            self.accessories
        ).sort(function(a,b) {if (a.displayName < b.displayName) return -1; if (a.displayName > b.displayName) return 1; return 0});

        return Object.keys(context.sortedAccessories).map(function(k) {return this[k].displayName}, context.sortedAccessories);
    }

    switch(context.onScreen) {
        case "DoRemove":
            if (request.response.selections) {
                for (var i in request.response.selections.sort()) {
                    this.removeAccessory(context.sortedAccessories[request.response.selections[i]]);
                }

                respDict = {
                    "type": "Interface",
                    "interface": "instruction",
                    "title": "Finished",
                    "detail": "Accessory removal was successful."
                }

                context.onScreen = "Complete";
                callback(respDict);
            }
            else {
                context.onScreen = null;
                callback(respDict, "platform", true, this.config);
            }
            break;
        case "Menu":
            context.onScreen = "Remove";
        case "Remove":
            respDict = {
                "type": "Interface",
                "interface": "list",
                "title": "Select accessory to " + context.onScreen.toLowerCase(),
                "allowMultipleSelection": context.onScreen == "Remove",
                "items": sortAccessories()
            }

            context.onScreen = "Do" + context.onScreen;
            callback(respDict);
            break;
        default:
            if (request && (request.response || request.type === "Terminate")) {
                context.onScreen = null;
                callback(respDict, "platform", true, this.config);
            }
            else {
                respDict = {
                    "type": "Interface",
                    "interface": "list",
                    "title": "Select option",
                    "allowMultipleSelection": false,
                    "items": ["Remove Accessory"]
                }

                context.onScreen = "Menu";
                callback(respDict);
            }
    }
}

QMotionPlatform.prototype.removeAccessory = function(accessory) {
    this.log("Remove: %s", accessory.displayName);

    if (this.accessories[accessory.UUID]) {
        delete this.accessories[accessory.UUID];
    }

    this.api.unregisterPlatformAccessories("homebridge-qmotion", "QMotion", [accessory]);
}

function QMotionAccessory(log, accessory, blind) {
    var self = this;

    this.accessory = accessory;
    this.blind = blind;
    this.log = log;

    this.accessory.on('identify', function(paired, callback) {
        self.log("%s - identify", self.accessory.displayName);
        callback();
    });

    this.blind.on('currentPosition', function(blind){
        accessory.getService(Service.WindowCovering).getCharacteristic(Characteristic.CurrentPosition).setValue(blind.state.currentPosition);
    });

    this.blind.on('positionState', function(blind){
        accessory.getService(Service.WindowCovering).getCharacteristic(Characteristic.PositionState).setValue(blind.state.positionState);
    });

    var service = accessory.getService(Service.WindowCovering);

    service
        .getCharacteristic(Characteristic.CurrentPosition)
        .on('get', function(callback) {callback(null, self.blind.state.currentPosition)})
        .setValue(self.blind.state.currentPosition);

    service
        .getCharacteristic(Characteristic.TargetPosition)
        .setProps({ minStep: 25 })
        .on('get', function(callback) {callback(null, self.blind.state.targetPosition)})
        .on('set', function(value, callback) {self.setTargetPosition(value, callback)});

    service.getCharacteristic(Characteristic.PositionState)
        .on('get', function(callback) {callback(null, self.blind.state.positionState)})
        .setValue(self.blind.state.positionState);

    accessory.updateReachability(true);
}

QMotionAccessory.prototype.setTargetPosition = function(value, callback){
    this.log("%s - Setting target position: %s", this.accessory.displayName, value);

    var self = this;

    this.blind.move(value, function(position) {
        if (position == null) {
            callback(new Error("Invalid Target Position"), false);
            return;
        }

        // send the command twice in case the blind was already moving
        self.blind.move(value, function(position) {
            callback();
        });
    });
}
