node-js-keynote2pdf
===================

A node.js module which receives a zipped Keynote presentation (a path to a zip file), converts it to pdf (well, asks Keynote to convert it), and returns the pdf.

  * [Two main points](#two-main-points)
  * [Main Principles](#main-principles)
  * [Important: Dependencies](#important-dependencies)
  * [API](#api)
  * [Setup and Examples](#setup-and-examples)
  * [Interesting Information](#interesting-information)
  * [License](#license)
  * [About Nuxeo](#about-nuxeo)

#### Two main points:

1. Will **work only on Mac OS**,
2. and **only with Keynote installed**

Tested with Mac OS X.9 Mavericks

### Main Principles
This module is quite simple: Receives a .zip, returns a .pdf. It assumes the .zip is a keynote presentation. Here is the main flow:
* Conversion:
  * Unzip the received file
  * Call an AppleScript to tell Keynote to export it to PDF
  * Send back the pdf in the callback
  * (all this being done asynchronously)
* Cleanup of the files (.key package, result .pdf) every 5 minutes by default
* The callback receives the regular (error, data) parameters (see below)

### Important: Dependencies
Modules to install on your node server:

	npm install node-uuid
	npm install adm-zip
	npm install applescript

### API

* **`configure`**`(inConfig)`: `inConfig` is an object with the following, optionnal properties:
  * `cleanup_timeout`
    * Every `cleanup_timeout` ms, the module will delete previous files created by the conversions.
    * Default value: 300000 (5 minutes)
  * `max_lifespan`
    * (Milliseconds)
    * When you don't explicitely call canClean() after a succesful conversion, temporary files are not deleted. To void flooding the disk, files are deleted if they were created since more than max_lifespan.
    * You must think about specific and probably rare usecase where either Keynote is very loaded, or a very, very big presentation is veing converted and the conversion takes a lot of time, so you want to avoid accidental removal of temporary file that is infact used. One hour seams to be good.
    * Default value: 3600000 (one hour)
  * `debug`
    * More or less info messages in the console
    * Default value is `false`

* **`getInfo`**`()` returns an object containing the configuration and other info:
  * `config`, with `cleanup_timeout`, `max_lifespan`, `debug`, ...(possibly others) properties
  * `conversion_folder`: The full path to the conversion folder
  * `stats`
    * `conversions`: The total count of calls to handleRequest
    * `conversions_ok`: The count of succesful requests (pdf was returned to the client)

* **`convert`**`(inZipFilePath, inCallback)` is the main API
  * `inZipFilePath` is the full path to a .zip file containing the Keynote presentation
  * `inCallback(inError, inData)`
    * When there is no error:
      * `inError` is `null`
      * `inData` has the following properties:
        * `uid`: A unique (string) identifier, to easily identify misc. requests when several are handled concurrently
        * `step`: A string telling what is the current step (unzipping the file, converting, sending the pdf)
          * Possible values are "Unzipping the file", "Converting the file" and "Done"
          * Constants are provided: `keynote2pdf.k.STEP_UNZIP`, `keynote2pdf.k.STEP_CONVERT` and `keynote2pdf.k.STEP_DONE`
        * `pdf`: Full path to the pdf, result of the conversion. This property is null as long as `step` id not `keynote2pdf.k.STEP_DONE`
    * When an error occured:
      * `inError` is not `null` and its `message` field contains the description of the problem
      * ìnData` has the following properties:
        * `uid`: A unique (string) identifier, to easily identify misc. requests when several are handled concurrently
        * `errorLabel`: As its name states. Very often, it will be the same as `inError.message`

### Setup and Examples
* Run only on Mac OS. Was developed under Mavericks (Mac OS X.9.n)
  * (if used on Windows/Linux, it just returns an error and does nothing)
* Install Keynote on the Mac
* (install nodejs)
* Install the required external modules, if not yet installed on your server:

    ```
    npm install node-uuid
    npm install adm-zip
    npm install applescript
    ```

* Well. Also install this module, `npm install keynote2pdf` 
* See the `kn2pdf-usage-example-01.js` example to see how to use the module

### Interesting Information

This module was developed as part of [nuxeo-keynote](https://github.com/ThibArg/nuxeo-keynote), a plug-in for [Nuxeo](http://nuxeo.com), which detects a zip file contains a Keynote presentation, then calls this nodejs server and handles the returned pdf (full text index and preview of the pdf in the browser)

(yes. It _is_ interesting)

### License
```
(C) Copyright 2014 Nuxeo SA (http://nuxeo.com/) and others.
 
All rights reserved. This program and the accompanying materials
are made available under the terms of the GNU Lesser General Public License
(LGPL) version 2.1 which accompanies this distribution, and is available at
http://www.gnu.org/licenses/lgpl-2.1.html

This library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Lesser General Public License for more details.

Contributors:
    Thibaud Arguillere (https://github.com/ThibArg)
```


### About Nuxeo

Nuxeo provides a modular, extensible Java-based [open source software platform for enterprise content management](http://www.nuxeo.com/en/products/ep) and packaged applications for [document management](http://www.nuxeo.com/en/products/document-management), [digital asset management](http://www.nuxeo.com/en/products/dam) and [case management](http://www.nuxeo.com/en/products/case-management). Designed by developers for developers, the Nuxeo platform offers a modern architecture, a powerful plug-in model and extensive packaging capabilities for building content applications.

More information on: <http://www.nuxeo.com/>
