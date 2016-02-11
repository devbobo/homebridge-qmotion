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
                    self.accessories[uuid] = new QMotionAccessory(self.log, accessory, blind);
                }
            });
        });
    }.bind(this));
}

QMotionPlatform.prototype.addAccessory = function(blind) {
    this.log("Found: %s [%s]", blind.name, blind.addr);

    var accessory = new PlatformAccessory(blind.name, UUIDGen.generate(blind.addr));
    accessory.addService(Service.WindowCovering);
    this.accessories[accessory.UUID] = new QMotionAccessory(this.log, accessory, blind);

    this.api.registerPlatformAccessories("homebridge-qmotion", "QMotion", [accessory]);
}

QMotionPlatform.prototype.configureAccessory = function(accessory) {
    this.accessories[accessory.UUID] = accessory;
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

    this.blind.on('currentPosition', function(blind){
        console.log("currentPosition", blind.state.currentPosition);
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
