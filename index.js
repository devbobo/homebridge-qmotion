var QMotion = require('qmotion');

var Characteristic, PlatformAccessory, Service, UUIDGen;

module.exports = function(homebridge) {
    PlatformAccessory = homebridge.platformAccessory;

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-qmotion", "QMotion", QMotionPlatform, true);
};

function QMotionPlatform(log, config, api) {
    if (!config) {
        log.warn("Ignoring QMotion Platform setup because it is not configured");
        this.disabled = true;
        return;
    }

    this.config = config || {};

    var self = this;

    this.api = api;
    this.accessories = {};
    this.log = log;

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
        context.sortedAccessories = Object.keys(this.accessories).map(
            function(k){return this[k] instanceof PlatformAccessory ? this[k] : this[k].accessory},
            this.accessories
        ).sort(function(a,b) {if (a.displayName < b.displayName) return -1; if (a.displayName > b.displayName) return 1; return 0});

        return Object.keys(context.sortedAccessories).map(function(k) {return this[k].displayName}, context.sortedAccessories);
    }.bind(this);

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
        this.log("%s - identify", this.accessory.displayName);
        this.blind.identify(callback);
    }.bind(this));

    this.blind.on('currentPosition', function(position) {
        accessory.getService(Service.WindowCovering).getCharacteristic(Characteristic.CurrentPosition).updateValue(position);
    });

    this.blind.on('targetPosition', function(position) {
        accessory.getService(Service.WindowCovering).getCharacteristic(Characteristic.TargetPosition).updateValue(position);
    });

    this.blind.on('positionState', function(state) {
        accessory.getService(Service.WindowCovering).getCharacteristic(Characteristic.PositionState).updateValue(state);
    });

    var service = accessory.getService(Service.WindowCovering);

    service
        .getCharacteristic(Characteristic.CurrentPosition)
        .setProps({ minStep: 12.5, format: Characteristic.Formats.FLOAT })
        .setValue(self.blind.state.currentPosition);

    service
        .getCharacteristic(Characteristic.TargetPosition)
        .setProps({ minStep: 12.5, format: Characteristic.Formats.FLOAT })
        .setValue(self.blind.state.targetPosition)
        .on('set', function(value, callback) {self.setTargetPosition(value, callback)});

    service.getCharacteristic(Characteristic.PositionState)
        .setProps({ minStep: null })
        .setValue(self.blind.state.positionState);
}

QMotionAccessory.prototype.setTargetPosition = function(value, callback) {
    this.log("%s - Setting target position: %s", this.accessory.displayName, value);

    var self = this;

    this.blind.move(value, function(position) {
        if (position == null) {
            callback(new Error("Invalid Target Position"), false);
            return;
        }

        // send the command twice in case the blind was already moving
        setTimeout(function(self, position) {
            if (position == self.blind.state.targetPosition) {
                self.blind.move(position);
            }
        }, 500, this, value);

        callback(null);
    });
}
