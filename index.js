var FS = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var compileToHTML = require('./lib/compile-to-html')
const puppeteer = require('puppeteer');

var Hapi = require('hapi')
var Inert = require('inert')
var ChildProcess = require('child_process')
var PortFinder = require('portfinder')

const DEFAULT_OPTIONS = {
  outputDir: path.resolve(__dirname, 'output')
};

function ChromePrecompiler (staticDir, paths, options) {
  // this.staticDir = staticDir
  this.staticDir = path.resolve(__dirname, 'dist');
  console.log('Static dir:', this.staticDir);
  this.paths = paths
  this.options = options || DEFAULT_OPTIONS
}

ChromePrecompiler.prototype.apply = async function (compiler) {
  // compiler.plugin('after-emit', (compilation, done) => {
    return await Promise.all(
      this.paths.map(outputPath => {
        return new Promise((resolve, reject) => {
          serveAndPrerenderRoute(this.staticDir, outputPath, this.options, (pageContent) => {
            console.log(`GOT PRERENDERED HTML (${outputPath}):`);

            if (this.options.postProcessHtml) {
              pageContent = this.options.postProcessHtml({
                html: pageContent,
                route: outputPath
              })
            }
            var outputFolder = path.join(this.options.outputDir || this.staticDir, outputPath)
            mkdirp(outputFolder, error => {
              if (error) {
                return reject('Folder could not be created: ' + outputFolder + '\n' + error)
              }
              var file = path.join(outputFolder, 'index.html')
              FS.writeFile(
                file,
                pageContent,
                function (error) {
                  if (error) {
                    return reject('Could not write file: ' + file + '\n' + error)
                  }
                  resolve()
                }
              )
            })

          })
        })
      })
    );
  // })
}

const pc = new ChromePrecompiler( path.resolve(__dirname, '/dist'), ['/', '/about', '/blog']);
const result = pc.apply();
console.log('Precompiler apply: ', result);

function serveAndPrerenderRoute(staticDir, route, options, callback) {
  const originalArgs = arguments;
  PortFinder.getPort((error, port) => {
    if (error) throw error

    var Server = new Hapi.Server({
      connections: {
        routes: {
          files: {
            relativeTo: staticDir
          }
        }
      }
    });

    Server.connection({ port: port })


    Server.register(Inert, (error) => {
      if (error) throw error
      var indexPath = options.indexPath ? options.indexPath : path.join(staticDir, 'index.html')

      Server.route({
        method: 'GET',
        path: route,
        handler: function (request, reply) {
          reply.file(
            indexPath
          )
        }
      })

      Server.route({
        method: 'GET',
        path: '/{param*}',
        handler: {
          directory: {
            path: '.',
            redirectToSlash: true,
            index: true,
            showHidden: true
          }
        }
      });

      Server.start(error => {
        // If port is already bound, try again with another port
        // if (error) return serveAndPrerenderRoute()
        if (error) {
          console.log('Hapi Error - address in use ' + port);
          return serveAndPrerenderRoute(...originalArgs);
        }

        (async () => {
          const url = `http://localhost:${port}${route}`;
          console.log(`Capturing URL: ${url}`);
          const browser = await puppeteer.launch();
          const page = await browser.newPage();
          await page.goto(url);
          await page.screenshot({path: `test-${route.replace(/\//gi, '')}.png`});
          const content = await page.content();
          await page.close();
          browser.close();
          Server.stop();
          callback(content);
        })();

      });
    });
  })
};


// SimpleHtmlPrecompiler.prototype.apply = function (compiler) {
//   var self = this
//   compiler.plugin('after-emit', function (compilation, done) {
//     Promise.all(
//       self.paths.map(function (outputPath) {
//         return new Promise(function (resolve, reject) {
          // compileToHTML(self.staticDir, outputPath, self.options, function (prerenderedHTML) {
          //   if (self.options.postProcessHtml) {
          //     prerenderedHTML = self.options.postProcessHtml({
          //       html: prerenderedHTML,
          //       route: outputPath
          //     })
          //   }
          //   var folder = path.join(self.options.outputDir || self.staticDir, outputPath)
          //   mkdirp(folder, function (error) {
          //     if (error) {
          //       return reject('Folder could not be created: ' + folder + '\n' + error)
          //     }
          //     var file = path.join(folder, 'index.html')
          //     FS.writeFile(
          //       file,
          //       prerenderedHTML,
          //       function (error) {
          //         if (error) {
          //           return reject('Could not write file: ' + file + '\n' + error)
          //         }
          //         resolve()
          //       }
          //     )
          //   })
//           })
//         })
//       })
//     )
//     .then(function () { done() })
//     .catch(function (error) {
//       // setTimeout prevents the Promise from swallowing the throw
//       setTimeout(function () { throw error })
//     })
//   })
// }

// module.exports = SimpleHtmlPrecompiler
