#!/usr/bin/env node
  
try {
 // If you've installed the module
 require('./node_modules/cordova-icon/index.js')
}
catch (e) {
 console.log('cordova-icon missing: run > npm install cordova-icon')
}
