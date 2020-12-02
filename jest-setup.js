const { TextEncoder } = require("util");
const { Crypto } = require("@peculiar/webcrypto");

require("cross-fetch/polyfill");

global.crypto = new Crypto();
global.TextEncoder = TextEncoder;
