"use strict";
require('dotenv').config();
var connectionString = process.env.HUBCS;
var _ = require('underscore')
const debug = require('debug')('nbiot_cloud_gw');
const name = 'hub-proxy';

const azure_iot_common = require("azure-iot-common");
const iothub = require('azure-iothub');
const registry = iothub.Registry.fromConnectionString(connectionString);
const Message = require('azure-iot-device').Message;
const Gateway = require('./lib/Gateway.js').Gateway;
const gateway = new Gateway();
var devices = [];
var addDevicePromises = [];

function foundId(id){
	debug('id: ' + id);
}
gateway.on('message', function (message) {
	let payload = message.data.toString();
	let deviceId = message.to.toString().split("/")[2];
	debug(deviceId);
	
	var found = devices.find(o => o.id === deviceId);

	process.send({
		type: 'c2d',
		deviceIp: found.ip,
		payload: payload
	});
});

var start = async function () {
	try {
		await gateway.open(connectionString);
		debug(`hub_proxy [pid:${process.pid}] connected to IoT Hub`);
	} catch (error) {
		debug(error);
	}
};

process.on('message', async function (msg) {
	switch (msg.type) {
		case 'conn_DEV':
			// check if device has been provisioned, if not, silently drop it
			debug('[master] PDP_ON -------> [hub_proxy]: ' + msg.device.id);
			registry.get(msg.device.id, async function (err, res) {
				if (err) 
					debug(err.name)
				else 
				{
					devices.push(msg.device);
					debug(`[master] CONN_DEV ----> [hub_proxy]: ${JSON.stringify(msg.device)}`);
					addDevicePromises.push(gateway.addDevice(msg.device.id));
					await Promise.all(addDevicePromises);
				}
			});
	break;
	case 'disconn_DEV':
		debug(`[master] disCONN_DEV ----> [hub_proxy]`);
		break;
	case 'd2c':
		//send this UDP datagram to the ipAddress of the imsi
		debug(`[master] d2c ----> [hub_proxy]`);
		var message = new Message(msg.payload);

		for (var i = 0; i < devices.length; i++) {
			if (msg.ip === devices[i].ip) {
				try {
					await gateway.sendMessage(devices[i].id, message);
				} catch (error) {
					debug('Could not send message to IoT Hub: ' + error);
				}
			}
		}

		break;
	default:
		break;
}
});



start()
