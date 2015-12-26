var QMotion = require('qmotion');
var sleep = require('sleep');

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
            var QSync = new QMotion(this.addr);

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
    this.blind = blind;
    this.log = log;

    this.name = blind.name;

    this.currentPosition = 0;
    this.targetPosition = 0;
    this.state = Characteristic.PositionState.STOPPED;

    log(this.name + " [" + this.blind.addr + "]");
}

QMotionBlindAccessory.prototype = {
    identify: function(callback) {
        this.blind.identify(this.targetPosition, function() {
            callback();
        });
    },
    setTargetPosition: function(value, callback){
        var that = this;

        this.log("Setting target position: " + value);

        this.blind.move(value, function(position) {
            if (position == null) {
                callback(new Error("Invalid Target Position"), false);
                return;
            }

            // send the command twice in case the blind was already moving
            that.blind.move(value, function(position) {
                that.targetPosition = position;
                callback();
            });
        });
    },
    getServices: function() {
        var that = this;
        var services = [];

        this.service = new Service.WindowCovering(this.name);

        // TODO: add CurrentPosition
        this.service
            .getCharacteristic(Characteristic.CurrentPosition);

        this.service.getCharacteristic(Characteristic.TargetPosition)
            .setProps({ minStep: 25 })
            .on('get', function(callback) {callback(null, that.targetPosition)})
            .on('set', function(value, callback) {that.setTargetPosition(value, callback)});

        // TODO: add PositionState
        this.service
            .getCharacteristic(Characteristic.PositionState);

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
