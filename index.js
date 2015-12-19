var QMotion = require('qmotion');
var sleep = require('sleep');

var QSync;

function QMotionPlatform(log, config) {
    this.addr = config["addr"];
    this.log = log;
}

QMotionPlatform.prototype = {
    accessories: function(callback) {
        this.log("Fetching QMotion devices.");

        var that = this;
        var foundAccessories = [];
        
        if (this.addr != undefined) {
            QSync = new QMotion(this.addr);

            QSync.on("initialized", function(blinds) {
                for (var key in blinds) {
                    var accessory = new QMotionBlindAccessory(that.log, blinds[key]);
                    foundAccessories.push(accessory);
                }
                callback(foundAccessories);
            });
        }
        else {
            var client = QMotion.search();
    
            client.on("found", function(device) {
                QSync = device;
    
                for (i = 0; i < device.blinds.length; i++) {
                    var accessory = new QMotionBlindAccessory(that.log, device.blinds[i]);
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
    // device info
    this.name = blind.name;
    this.deviceId = blind.addr;
    this.targetPosition = 0;
    this.log = log;

    log(this.name + " [" + this.deviceId + "]");
}

QMotionBlindAccessory.prototype = {
    getTargetPosition: function(callback) {
        callback(null, this.targetPosition);
    },
    identify: function(callback) {
        QSync.identify(this.deviceId, this.targetPosition, function() {
            callback();
        });
    },
    setTargetPosition: function(value, callback){
        var that = this;

        this.log("Setting target position: " + value);

        QSync.move(that.deviceId, value, function(position) {
	        if (position == null) {
                callback(new Error("Invalid Target Position"), false);
                return;
            }

            // send the command twice in case the blind was already moving
            QSync.move(that.deviceId, value, function(position) {
                that.targetPosition = position;
                callback();
            });
        });
    },
    getServices: function() {
        var that = this;
        var services = []
        var service = new Service.WindowCovering(this.name);

        // TODO: add CurrentPosition
        //service
        //.addCharacteristic(Characteristic.CurrentPosition);

        service
        .getCharacteristic(Characteristic.TargetPosition)
        .setProps({ minStep: 25 })
        .on('get', function(callback) {that.getTargetPosition(callback)})
        .on('set', function(value, callback) {that.setTargetPosition(value, callback)});

        // TODO: add PositionState
        //service
        //.addCharacteristic(Characteristic.PositionState);

        services.push(service);

        service = new Service.AccessoryInformation();
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
