var QMotion = require('qmotion');
var sleep = require('sleep');

function QMotionPlatform(log, config) {
    this.addr = config["addr"];
    this.log = log;
}

QMotionPlatform.prototype = {
    accessories: function(callback) {
        this.log("Fetching QMotion devices.");

        var self = this;
        var foundAccessories = [];
        
        if (this.addr != undefined) {
            var QSync = new QMotion(this.addr);

            QSync.on("initialized", function(blinds) {
                for (var i in blinds) {
                    var accessory = new QMotionBlindAccessory(self.log, blinds[i]);
                    foundAccessories.push(accessory);
                }
                callback(foundAccessories);
            });
        }
        else {
            var client = QMotion.search();
    
            client.on("found", function(device) {
                for (var i in device.blinds) {
                    var accessory = new QMotionBlindAccessory(self.log, device.blinds[i]);
                    foundAccessories.push(accessory);
                }
                
                callback(foundAccessories);
            });
            
            client.on("timeout", function() {
                callback(foundAccessories);
            });
        }
    }
}

function QMotionBlindAccessory(log, blind) {
    var self = this;

    this.blind = blind;
    this.log = log;

    this.name = blind.name;

    log(this.name + " [" + this.blind.addr + "]");

    this.blind.on('currentPosition', function(blind){
        self.service.getCharacteristic(Characteristic.CurrentPosition).setValue(blind.state.currentPosition);
    });

    this.blind.on('positionState', function(blind){
        self.service.getCharacteristic(Characteristic.PositionState).setValue(blind.positionState);
    });
}

QMotionBlindAccessory.prototype = {
    identify: function(callback) {
        this.blind.identify(this.blind.state.targetPosition, function() {
            callback();
        });
    },
    setTargetPosition: function(value, callback){
        var self = this;

        this.log("Setting target position: " + value);

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
    },
    getServices: function() {
        var self = this;
        var services = [];

        this.service = new Service.WindowCovering(this.name);

        this.service.getCharacteristic(Characteristic.CurrentPosition)
            .on('get', function(callback) {callback(null, self.blind.state.currentPosition)})
            .setValue(this.blind.state.currentPosition);

        this.service.getCharacteristic(Characteristic.TargetPosition)
            .setProps({ minStep: 25 })
            .on('get', function(callback) {callback(null, self.blind.state.targetPosition)})
            .on('set', function(value, callback) {self.setTargetPosition(value, callback)});

        this.service.getCharacteristic(Characteristic.PositionState)
            .on('get', function(callback) {callback(null, self.blind.positionState)})
            .setValue(this.blind.state.positionState);

        services.push(this.service);

        var service = new Service.AccessoryInformation();
        service.setCharacteristic(Characteristic.Manufacturer, "QMotion");
        services.push(service);

        return services;
    }
}

module.exports.accessory = QMotionBlindAccessory;
module.exports.platform = QMotionPlatform;

var Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    
    homebridge.registerAccessory("homebridge-qmotion-blind", "QMotionBlind", QMotionBlindAccessory);
    homebridge.registerPlatform("homebridge-qmotion", "QMotion", QMotionPlatform);
};
