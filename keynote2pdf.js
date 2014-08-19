/*	keynote2pdf.js

	Please, read the README file of the project for details and
	explanation, and how-to-use, etc.

	LGPL 2.1 license (see at the end of this file)

	===================================================
	IMPORTANT - DEPENDENCIES - IMPORTANT - DEPENDENCIES
	===================================================
	* Modules to install on your node server:
			npm install node-uuid
			npm install adm-zip
			npm install applescript

	* Will work only on Mac OS, and only with Keynote
	  installed
	===================================================

	Contributors:
		Thibaud Arguillere
			https://github.com/ThibArg
*/

(function () {
	/*
		====================================================
		require and var declaration
		====================================================
	*/
	// -> Require native node modules
	var fs = require('fs');
	var path = require("path");
	var os = require("os");

	//	-> Require third-party modules
	var uuid = require('node-uuid');
	var AdmZip = require('adm-zip');
	var applescript = require("applescript");

	//	-> Constants
	/*	CONSTANTS
	*/
	var CONSTANTS = {
		STEP_UNZIP	: "Unzipping the file",
		STEP_CONVERT: "Converting the file",
		STEP_DONE	: "Done"
	};

	/*	kCONFIG_DEFAULT
	*/
	var kCONFIG_DEFAULT = {
		cleanup_timeout : 300000,
		max_lifespan	: 3600000,
		debug			: false
	};

	/*	kCONVERSION_FOLDER_PATH
		No need for comments I suppose
	*/
	var kCONVERSION_FOLDER_PATH = os.tmpDir() + "KeynoteToPDFConversions/";

	/*	kAPPLE_SCRIPT_TEMPLATE
		Store the AppleScript, with placeholders for the misc. paths and names.
		This is where you would tune the thing. For example: Handle queryStirng
		parameters to tune the compression factor, exports also the skipped
		slides, etc.
	*/
	var kAPPLE_SCRIPT_TEMPLATE = 'tell application "Keynote"\n'
						+ '\n'
						+ '--if playing is true then tell the front document to stop\n'
						+ '\n'
						+ 'set conversionFolderPath to "<FOLDER_PATH/>"\n'
						+ '-- Open the presentation\n'
						+ 'set pathToKey to "<KEYNOTE_FILE_PATH/>"\n'
						+ 'open (POSIX file pathToKey) as alias\n'
						+ '\n'
						+ '-- Save a reference to this document\n'
						+ 'set thePresentation to document "<KEYNOTE_FILE_NAME/>"\n'
						+ '\n'
						+ '-- Set up names and paths\n'
						+ 'set documentName to the (name of thePresentation) & ".pdf"\n'
						+ 'set the targetFileHFSPath to ((POSIX file conversionFolderPath as alias) & documentName) as string\n'
						+ '\n'
						+ '-- Convert to pdf\n'
						+ 'export thePresentation to file targetFileHFSPath as PDF with properties {compression factor:0.3, export style:IndividualSlides, all stages:true, skipped slides:false}\n'
						+ '\n'
						+ '-- Done\n'
						+ 'close thePresentation\n'
						+ '\n'
						+ 'return the POSIX path of targetFileHFSPath\n'
						+ '\n'
						+ 'end tell\n';

	//	-> Variables
	/*	gIsMac
		Nothing will work if we are not on Mac
	*/
	gIsMac = os.platform() === "darwin";
	if(!gIsMac) {
		console.error("keynote2pdf - Invalid platform error: Found '" + os.platform() + "', needs Mac OS ('darwin')");
	}

	/*	gHandledDocs
		An array storing the temporary files to cleanup every kAUTO_CLEANUP_TIMEOUT
	*/
	var gHandledDocs = [];

	/*	config
		The misc. configuration properties
	*/
	var gConfig = kCONFIG_DEFAULT;

	/*	initDone
		A basic flag
	*/
	var gInitDone = false;

	/*	Stats
	*/
	var gConversionsCount = 0,
		gConversionsOkCount = 0;


	/*
		====================================================
		Private API
		====================================================
	*/
	/*	fallbackCallback
		Stub to be used when caller does not use a callback
		(which is an error actually)
	*/
	function fallbackCallback() {
		// Nothing
	}

	/*	doUnzipConvertAndReturnPDF

	*/
	function doUnzipConvertAndReturnPDF(inInfos, inCallback) {

		var pathToExtractionFolder, zip, oldPath, newPath;

		inCallback = typeof inCallback == "function" ? inCallback : fallbackCallback;

		inCallback(null, {uid	: inInfos.uid,
						  step	: CONSTANTS.STEP_UNZIP,
						  pdf	: null
						});

		pathToExtractionFolder = appendSlashIfNeeded( inInfos.folderPath );
		try {
			zip = new AdmZip(inInfos.pathToFileToHandle);
			// Notice: extractAllTo() is synchronous
			zip.extractAllTo(pathToExtractionFolder, /*overwrite*/true);

			fs.readdir(pathToExtractionFolder, function(err, files) {
				var keynoteFileName = "";
				files.some(function(fileName) {
					if(stringEndsWith(fileName, ".key")) {
						keynoteFileName = fileName;
						return true;
					}
					return false;
				});
				if(keynoteFileName !== "") {
					// To handle the fact that several requests could ask to convert
					// documents with the same name, and to avoid conflicts in
					// Keynote, we use the UUID as name of the document so Keynote
					// is not confused (actullay, it is more the AppleScript which
					// would be confusing Keynote)
					oldPath = pathToExtractionFolder + keynoteFileName;
					newPath = pathToExtractionFolder + inInfos.uid + ".key";
					fs.renameSync(oldPath, newPath);
					inInfos.pathToFileToHandle = newPath;
					doConvertAndReturnPDF(inInfos, inCallback);
				} else {
					console.log("Error: Can't find the .key file in the unzipped document");
					inCallback(new Error("Can't find the .key file in the unzipped document"),
								{ uid: inInfos.uid,
								  errorLabel: "Can't find the .key file in the unzipped document",
								});
					// Mark ready for cleanup
					inInfos.done = true;
				}
			});
		} catch (e) {
			console.log("Error extracting the .zip "+ e);
			inCallback(new Error("Error extracting the .zip "+ e),
						{ uid: inInfos.uid,
						  errorLabel: "Error extracting the .zip "+ e,
						});
			// Mark ready for cleanup
			inInfos.done = true;
		}
	}

	/*	doConvertAndReturnPDF

	*/
	function doConvertAndReturnPDF(inInfos, inCallback) {

		var script;

		inCallback = typeof inCallback == "function" ? inCallback : fallbackCallback;
		inCallback(null, {uid	: inInfos.uid,
						  step	: CONSTANTS.STEP_CONVERT,
						  pdf	: null
						});

		script = kAPPLE_SCRIPT_TEMPLATE.replace("<FOLDER_PATH/>", inInfos.folderPath)
									   .replace("<KEYNOTE_FILE_PATH/>", inInfos.pathToFileToHandle)
									   .replace("<KEYNOTE_FILE_NAME/>", path.basename(inInfos.pathToFileToHandle) /*inInfos.uid + ".key"*/);
		//logIfDebug("-----------\n" + script + "\n----------");
		
		// We wait until the file is really here and valid
		waitUntilFileExists(inInfos.pathToFileToHandle, 25, 40, function(result) {
			if(result) {
				try {
					applescript.execString(script, function(err, result) {
						if(err) {
							console.log("Conversion error: " + err);
							inCallback(err,
										{ uid: inInfos.uid,
								 		  errorLabel: "Conversion error:" + err
								 		});
							// Mark ready for cleanup
							inInfos.done = true;
						} else {
							inInfos.pathToFileToHandle = result;
							doReturnThePDF(inInfos, inCallback);
						}
					});
				} catch (e) {
					console.log("applescript.execString() error: "+ e);
					inCallback(new Error("applescript.execString() error: "+ e),
								{ uid: inInfos.uid,
								  errorLabel: "applescript.execString() error: "+ e,
								});
					// Mark ready for cleanup
					inInfos.done = true;
				}
			} else {
				console.log("Can't find the keynote file at "+ inInfos.pathToFileToHandle);
				inCallback(new Error("Can't find the keynote file at "+ inInfos.pathToFileToHandle),
							{ uid: inInfos.uid,
							  errorLabel: "Can't find the keynote file at "+ inInfos.pathToFileToHandle,
							});
				// Mark ready for cleanup
				inInfos.done = true;
			}
		});
	}

	/*	doReturnThePDF

	*/
	function doReturnThePDF(inInfos, inCallback) {

		inCallback = typeof inCallback == "function" ? inCallback : fallbackCallback;
		gConversionsOkCount += 1;
		inCallback(null, {uid	: inInfos.uid,
						  step	: CONSTANTS.STEP_DONE,
						  pdf	: inInfos.pathToFileToHandle
						});
		// Here we don't inInfos.done = true; because we don't want
		// to delete the pdf while the caller is sending it. Caller
		// must call canClean() after handling the returned PDF
	}


	/*	============================================================
		Utilities
		============================================================ */
	/* logIfDebug

	*/
	function logIfDebug(inWhat) {
		if(gConfig.debug) {
			console.log(inWhat);
		}
	}


	/* cleanupExtractionFolder

	*/
	function cleanupExtractionFolder(cleanAll, inNextTimeout) {

		var now, objs;

		cleanAll = cleanAll || false;

		if(cleanAll) {
			deleteFolderRecursiveSync(kCONVERSION_FOLDER_PATH);
		} else {
			now = Date.now();

			objs = Object.keys(gHandledDocs);
			if(objs.length > 0) {
				logIfDebug("Cleanup. " + objs.length + " folder"+ (objs.length > 1 ? "s" : "") + " to handle");
				Object.keys(gHandledDocs).forEach(function(key) {
					var obj = gHandledDocs[key];
					if(obj && (obj.done || (now - obj.timeStamp) > gConfig.max_lifespan))  {
						deleteFolderRecursiveSync(obj.folderPath);
						delete  gHandledDocs[key];
					}
				});
			}
		}
		// Schedule next iteration
		if(typeof inNextTimeout === "number" && inNextTimeout > 0) {
			setTimeout(function() {
				cleanupExtractionFolder(false, inNextTimeout);
			}, inNextTimeout);
		}
	}

	/*	deleteFolderRecursiveSync

		Thanks to http://www.geedew.com/2012/10/24/remove-a-directory-that-is-not-empty-in-nodejs/
	*/
	function deleteFolderRecursiveSync(path) {
	  if( fs.existsSync(path) ) {
	    fs.readdirSync(path).forEach(function(file,index){
	      var curPath = path + "/" + file;
	      if(fs.lstatSync(curPath).isDirectory()) { // recurse
	        deleteFolderRecursiveSync(curPath);
	      } else { // delete file
	        fs.unlinkSync(curPath);
	      }
	    });
	    if(path !== kCONVERSION_FOLDER_PATH) {
		    fs.rmdirSync(path);
		}
	  }
	};

	/*	waitUntilFileExists

	*/
	function waitUntilFileExists(inPath, inTimeout, inMaxChecks, inCallback) {
		if(inMaxChecks <= 0) {
			inCallback(false);
		} else {
			if (fs.existsSync(inPath)) {
				inCallback(true);
			} else {
				setTimeout( function() {
					inMaxChecks -= 1;
					waitUntilFileExists(inPath, inTimeout, inMaxChecks, inCallback);
				}, inTimeout);
			} 
		}
	}

	/*	appendSlashIfNeeded

	*/
	function appendSlashIfNeeded(inPath) {
		if(typeof inPath === "string") {
			if(inPath.length === 0) {
				return "/";
			} else if(inPath[ inPath.length - 1 ] !== "/") {
				return inPath + "/";
			}
		}
		
		return inPath;
	}

	/*	stringEndsWith

	*/
	function stringEndsWith(inStr, inToTest) {
		var position = inStr.length;
		position -= inToTest.length;
		var lastIndex = inStr.indexOf(inToTest, position);
		return lastIndex !== -1 && lastIndex === position;
	}


	/*
		====================================================
		Public API
		====================================================
	*/
	/*	initSync()
		Set up configuration and the environment. Synchronous call.

		Automatically called when needed if not explicitely called before
		convert()
	*/
	function initSync(inConfig) {
		// Get the config
		if(inConfig) {
			if("cleanup_timeout" in inConfig && inConfig.cleanup_timeout > 0) {
				gConfig.cleanup_timeout = inConfig.cleanup_timeout;
			}
			if("max_lifespan" in inConfig && inConfig.max_lifespan > 0) {
				gConfig.max_lifespan = inConfig.max_lifespan;
			}
			if("debug" in inConfig) {
				gConfig.debug = inConfig.debug;
			}
		}

		// Prepare the stuff
		//	-> Check conversion folder
		if(!fs.existsSync(kCONVERSION_FOLDER_PATH)) {
			fs.mkdirSync(kCONVERSION_FOLDER_PATH);
		} else {
		//	-> Cleanup previous temp. files if any
			cleanupExtractionFolder(true);
		}

		console.log("keynote2pdf configuration:\n"
					+ "    Temp. folder: " + kCONVERSION_FOLDER_PATH + "\n"
					+ "    Cleanup every: " + gConfig.cleanup_timeout + " ms\n"
					+ "    Max lifespan: " + gConfig.max_lifespan + " ms\n"
					+ "    Debug mode: " + gConfig.debug + "\n");

		//	->  Install the cleaning scheduler every config.cleanup_timeout
		setTimeout(function() {
			cleanupExtractionFolder(false, gConfig.cleanup_timeout);
		}, gConfig.cleanup_timeout);

		gInitDone = true;
	}

	/*	convert

		Main entry point. Handle everything
	*/
	function convert(inZipFilePath, inCallback) {
		var theUid,
			destFolder,
			infos;

		gConversionsCount += 1;

		inCallback = typeof inCallback == "function" ? inCallback : fallbackCallback;

		if(!gInitDone) {
			initSync();
		}

		if(!gIsMac) {
			inCallback(new Error("Invalid platform error: keynote2pdf needs Mac OS"),
						{ errorLabel: "Invalid platform error: keynote2pdf needs Mac OS",
						});
			return;
		}

		theUid = uuid.v4();
		destFolder = kCONVERSION_FOLDER_PATH + theUid + "/";
		fs.mkdirSync(destFolder);

		infos = {	uid: theUid,
					folderPath: destFolder,
					timeStamp: Date.now(),
					done: false,
					pathToFileToHandle: inZipFilePath
				};
		gHandledDocs[theUid] = infos;

		doUnzipConvertAndReturnPDF(infos, inCallback);

	}

	/*	canClean

		To be called after receiving the PDF in the callback and after having
		handling it. Let the module delete it in its cleaning loop.
	*/
	function canClean(inUid) {
		if(typeof inUid === "string" && inUid !== "") {
			var infos = gHandledDocs[inUid];
			if(infos != null) {
				infos.done = true; // set the flag so cleaning can be done
			}
		}
	}


	/*	getInfo()

	*/
	function getInfo() {
		return {
			config	: gConfig,
			conversion_folder: kCONVERSION_FOLDER_PATH,
			stats	: {
				conversions		: gConversionsCount,
				conversions_ok	: gConversionsOkCount
			}
		};
	}

	// Give this public API to commonJS
	var keynote2pdf = convert;
	keynote2pdf.initSync = initSync;
	keynote2pdf.convert = convert;
	keynote2pdf.getInfo = getInfo;
	keynote2pdf.canClean = canClean;
	keynote2pdf.k = CONSTANTS;
	module.exports = keynote2pdf;

	
}).call(this);

/*
 * (C) Copyright 2014 Nuxeo SA (http://nuxeo.com/) and others.
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 */

// -- EOF--