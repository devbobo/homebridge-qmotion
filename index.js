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
    config = config || {};

    var self = this;

    this.api = api;
    this.accessories = [];
    this.configured = [];
    this.log = log;

    this.api.on('didFinishLaunching', function() {
        var client = QMotion.search();

        client.on("found", function(device) {
            device.on("blind", function(blind) {
                var uuid = UUIDGen.generate(blind.addr);

                if (self.configured.indexOf(uuid) == -1) {
                    self.addAccessory(blind);
                }
                else {
                    for (var index in self.accessories) {
                        if (self.accessories[index].UUID == uuid) {
                            self.log("Online: %s [%s]", self.accessories[index].displayName, blind.addr);
                            self.initAccessory(self.accessories[index], blind);
                            break;
                        }
                    }
                }
            });
        });
    }.bind(this));
}

QMotionPlatform.prototype.addAccessory = function(blind) {
    var self = this;

    this.log("Found: %s [%s]", blind.name, blind.addr);

    var accessory = new PlatformAccessory(blind.name, UUIDGen.generate(blind.addr));
    accessory.addService(Service.WindowCovering);
    this.initAccessory(accessory, blind);

    self.configured.push(accessory.UUID);
    self.accessories.push(accessory);
    self.api.registerPlatformAccessories("homebridge-qmotion", "QMotion", [accessory]);
}

QMotionPlatform.prototype.configureAccessory = function(accessory) {
    this.configured.push(accessory.UUID);
    this.accessories.push(accessory);
}

QMotionPlatform.prototype.initAccessory = function(accessory, blind) {
    var self = this;

    accessory.blind = blind;

    accessory.blind.on('currentPosition', function(blind){
        console.log("currentPosition", blind.state.currentPosition);
        accessory.getService(Service.WindowCovering).getCharacteristic(Characteristic.CurrentPosition).setValue(blind.state.currentPosition);
    });

    accessory.blind.on('positionState', function(blind){
        accessory.getService(Service.WindowCovering).getCharacteristic(Characteristic.PositionState).setValue(blind.state.positionState);
    });

    var service = accessory.getService(Service.WindowCovering);

    service
        .getCharacteristic(Characteristic.CurrentPosition)
        .on('get', function(callback) {callback(null, accessory.blind.state.currentPosition)})
        .setValue(accessory.blind.state.currentPosition);

    service
        .getCharacteristic(Characteristic.TargetPosition)
        .setProps({ minStep: 25 })
        .on('get', function(callback) {callback(null, accessory.blind.state.targetPosition)})
        .on('set', function(value, callback) {self.setTargetPosition(accessory, value, callback)});

    service.getCharacteristic(Characteristic.PositionState)
        .on('get', function(callback) {callback(null, accessory.blind.state.positionState)})
        .setValue(accessory.blind.state.positionState);
}

QMotionPlatform.prototype.setTargetPosition = function(accessory, value, callback){
    this.log("%s - Setting target position: %s", accessory.displayName, value);

    accessory.blind.move(value, function(position) {
        if (position == null) {
            callback(new Error("Invalid Target Position"), false);
            return;
        }

        // send the command twice in case the blind was already moving
        accessory.blind.move(value, function(position) {
            callback();
        });
    });
}
