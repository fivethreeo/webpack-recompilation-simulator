'use strict';
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
let changeCount = 0;

module.exports = class WebpackRecompilationHelper {

  constructor (compiler, options) {
    this.compiler = compiler;
    this.options = options || {};
    this.mappings = { files: {}, folders: {} };
    // The tmp direcotry for the modified files
    this.tmpDirectory = this.options.tmpDirectory || path.join(process.cwd(), 'tmp');
    // As we don't want to change the real source files we tell webpack to use
    // a version in the tmp directory
    compiler.plugin('normal-module-factory', (nmf) => {
      nmf.plugin('before-resolve', (data, callback) => {
        return callback(null, this._resolveDependency(data));
      });
    });
    // Store the stats after the compilation is done
    compiler.plugin('done', (stats) => {
      this.stats = stats;
    });
  }

  /**
   * This function creates a tmp version of the given file and modifies it
   * and will add the mapping so this file will be used during the next compilation
   *
   * @param {string} filename - The absolute path to the source file e.g. /a/path/main.js
   * @param {object} options - You have to set options.banner, options.footer or options.content to modify the file
   */
  simulateFileChange (filename, options) {
    options = options || {};
    filename = path.resolve(filename);
    const tmpFileName = path.join(this.tmpDirectory, '__' + (++changeCount), path.dirname(filename), path.basename(filename));
    const originalFileContent = fs.readFileSync(filename).toString();
    const banner = options.banner || '';
    const footer = options.footer || '';
    let content = options.content;
    if (content === undefined) {
      content = banner + originalFileContent + footer;
    }
    if (content === originalFileContent) {
      throw new Error('File was not changed');
    }
    mkdirp.sync(path.dirname(tmpFileName));
    fs.writeFileSync(tmpFileName, content);
    this.addMapping(filename, tmpFileName);
  }

  /**
   * Add a mapping so that webpack will use the targetFile instead of the sourceFile
   * during compilation
   */
  addMapping (sourceFile, targetFile) {
    this.mappings.files[sourceFile] = targetFile;
    this.mappings.folders[path.dirname(targetFile)] = path.dirname(sourceFile);
  }

  /**
   * @private
   *
   * This function uses the mapping to compile the fake file instead of the real source file
   */
  _resolveDependency (data) {
    data.context = this.mappings.folders[data.context] || data.context;
    data.request = this.mappings.files[path.resolve(data.context, data.request)] || data.request;
    return data;
  }

  /**
   * Compile
   */
  run () {
    return new Promise((resolve) => this.compiler.run(() => resolve(this.stats)));
  }

};