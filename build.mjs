import * as esbuild from 'esbuild'
import * as fs from 'fs/promises'
import path from 'path'
import { JSDOM } from 'jsdom'

const inputDirectory = 'site'
const outputDirectory = 'dist'

/**
 * Convert a platform-specific file/directory path on the current operating
 * system to a Linux-style file/directory path.
 *
 * @param {string} pathParameter Platform-specific file/directory path to convert.
 * @returns {string} The platform-specific file/directory path parameter,
 * converted to Linux-style path syntax.
 */
function pathToLinuxSyntax(pathParameter) {
  return pathParameter.split(path.sep).join('/')
}

/**
 * Resolve the relative file/directory path from `basePath` to `pathParameter`,
 * based on the current working directory. At times we have two absolute paths,
 * and we need to derive the relative path from one to the other.
 *
 * The return value will be a Linux-style file/directory path, regardless of the
 * current operating system.
 *
 * @param {string} basePath Base path to start the resolution from.
 * @param {string} pathParameter Relative file/directory path (relative to
 * `basePath`).
 * @returns {string} The resolved file/directory path, in Linux-style path syntax.
 */
function relativePathToLinuxSyntax(basePath, pathParameter) {
  return pathToLinuxSyntax(path.relative(basePath, pathParameter))
}

/**
 * Delete files and directories, recursively, and bypass any confirmation
 * requests (equivalent to doing 'rm -rf' in Linux).
 *
 * @param {import('fs').PathLike} pathParameter Path to the file or directory to
 * delete.
 * @returns {Promise<void>}
 */
async function deleteRecursively(pathParameter) {
  await fs.rm(pathParameter, { recursive: true, force: true })
}

/**
 * Create a directory, including any parent directories if necessary.
 *
 * @param {import('fs').PathLike} directoryPath Path to the directory to create.
 * @returns {Promise<void>}
 */
async function createDirectoryRecursively(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true })
}

/**
 * Walk a directory recursively and return a full recursive list of all files
 * and subdirectories.
 *
 * @param {import('fs').PathLike} directoryPath Path to the directory to walk
 * recursively.
 * @returns {Promise<string[]>} A full recursive list of all files and
 * subdirectories.
 */
async function walkDirectory(directoryPath) {
  let result = []
  for (const item of await fs.readdir(directoryPath, { withFileTypes: true })) {
    const fullPath = path.join(directoryPath, item.name)
    if (item.isDirectory()) {
      result = [...result, ...(await walkDirectory(fullPath))]
    } else {
      result = [...result, fullPath]
    }
  }
  return result
}

/**
 * Copy the contents of `sourceDirectory`, recursively, into
 * `destinationDirectory`.
 *
 * @param {string} sourceDirectory Directory containing items to copy.
 * @param {string} destinationDirectory Directory into which items will be
 * copied.
 * @param {{excludedExtensions: string[]}} options Options (which extensions to
 * exclude from the copy).
 * @returns {Promise<void>}
 */
async function copyTree(sourceDirectory, destinationDirectory, options) {
  for (const item of await fs.readdir(sourceDirectory, {
    withFileTypes: true,
  })) {
    const sourceItemPath = path.join(sourceDirectory, item.name)
    const destinationItemPath = path.join(destinationDirectory, item.name)

    if (item.isDirectory()) {
      await createDirectoryRecursively(destinationItemPath)
      await copyTree(sourceItemPath, destinationItemPath, options)
    } else {
      if (
        !options.excludedExtensions.includes(
          path.extname(item.name).toLowerCase()
        )
      ) {
        await createDirectoryRecursively(path.dirname(destinationItemPath))
        await fs.copyFile(sourceItemPath, destinationItemPath)
      }
    }
  }
}

/**
 * Convert an HTML `href` or `src` attribute value from the source code into the
 * equivalent site URL. The site URL always has a leading slash to indicate the
 * root of the site, and the rest of the URL is relative to the site's `dist`
 * directory.
 *
 * For example, the site URL "/style.css" would load the file in
 * `dist/style.css`.
 *
 * @param {string} relativePathToHtmlSourceCode Relative path (from the root of
 * the source code) to the HTML source code file containing the attribute.
 * @param {unknown} attributeValue
 * @returns {string}
 */
function toRootRelative(htmlFileRelFromSrc, attributeValue) {
  if (
    !attributeValue ||
    /^https?:\/\//i.test(attributeValue) ||
    attributeValue.startsWith('data:')
  ) {
    return null
  }

  if (attributeValue.startsWith('/')) {
    return attributeValue
  }

  const htmlDir = path.posix.dirname(htmlFileRelFromSrc)
  const joined = path.posix.normalize(path.posix.join(htmlDir, attributeValue))

  return '/' + joined.replace(/^\/+/, '')
}

/**
 * Replace a source-code attribute URL with the equivalent URL from the
 * distribution bundle.
 *
 * @param {Element} element
 * @param {string} attributeName
 * @param {unknown} attributeValue
 * @param {string} relativePathToHtmlSourceCode
 * @param {{[key: string]: string}} manifest
 * @returns {void}
 */
const replaceAttributeUrl = (
  element,
  attributeName,
  attributeValue,
  relativePathToHtmlSourceCode,
  manifest
) => {
  const rootRel = toRootRelative(relativePathToHtmlSourceCode, attributeValue)
  if (!rootRel) {
    return
  }
  const hashed = manifest[rootRel]
  if (!hashed) {
    return
  }

  element.setAttribute(attributeName, hashed)
}

/**
 * Rewrite an HTML document by replacing each source-code attribute URL with the
 * equivalent URL from the distribution bundle.
 *
 * @param {string} html
 * @param {string} relativePathToHtmlSourceCode
 * @param {{[key: string]: string}} manifest
 * @returns {string}
 */
function rewriteHtmlDocument(html, relativePathToHtmlSourceCode, manifest) {
  const dom = new JSDOM(html)
  const { document } = dom.window

  for (const element of document.querySelectorAll('link[href]')) {
    replaceAttributeUrl(
      element,
      'href',
      element.getAttribute('href'),
      relativePathToHtmlSourceCode,
      manifest
    )
  }

  for (const element of document.querySelectorAll('script[src]')) {
    replaceAttributeUrl(
      element,
      'src',
      element.getAttribute('src'),
      relativePathToHtmlSourceCode,
      manifest
    )
  }

  return dom.serialize()
}

/**
 * Find all files that should have file content hashes inserted into their names
 * as part of the build process.
 *
 * @returns {Promise<string[]>}
 */
async function findEntryPoints() {
  const all = await walkDirectory(inputDirectory)
  return all.filter((path) => /\.(js|css)$/i.test(path))
}

/**
 * Run Esbuild.
 *
 * @param {string[]} entryPoints
 * @param {string} outputDirectory
 * @returns {Promise<esbuild.BuildResult>}
 */
async function runEsbuild(entryPoints, outputDirectory) {
  return await esbuild.build({
    assetNames: '[dir]/[name]-[hash]',
    bundle: false,
    entryNames: '[dir]/[name]-[hash]',
    entryPoints,
    metafile: true,
    outdir: outputDirectory,
    write: true,
  })
}

/**
 * Create the distribution manifest (source code paths mapped to paths in the
 * distribution bundle).
 *
 * @param {esbuild.BuildResult} esbuildResult
 * @returns {{[key: string]: string}}
 */
function createManifest(esbuildResult) {
  /**
   * @type {{[key: string]: string}}
   */
  const manifest = {}
  for (const [outfile, meta] of Object.entries(
    esbuildResult.metafile.outputs
  )) {
    if (meta.entryPoint) {
      const sourceCodePath =
        '/' +
        relativePathToLinuxSyntax(inputDirectory, path.resolve(meta.entryPoint))
      const distributionBundlePath =
        '/' + relativePathToLinuxSyntax(outputDirectory, path.resolve(outfile))

      manifest[sourceCodePath] = distributionBundlePath
    }
  }
  return manifest
}

/**
 * Rewrite all HTML documents by replacing each source-code attribute URL with
 * the equivalent URL from the distribution bundle.
 *
 * @param {{[key: string]: string}} manifest
 * @returns {Promise<void>}
 */
async function rewriteHtmlDocuments(manifest) {
  const distFiles = await walkDirectory(outputDirectory)
  const htmlFiles = distFiles.filter((distributionFile) =>
    distributionFile.toLowerCase().endsWith('.html')
  )
  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, 'utf8')

    const relativePathToHtmlSourceCode = relativePathToLinuxSyntax(
      inputDirectory,
      htmlFile.replace(new RegExp('^' + outputDirectory), inputDirectory)
    )

    const rewritten = rewriteHtmlDocument(
      html,
      relativePathToHtmlSourceCode,
      manifest
    )
    await fs.writeFile(htmlFile, rewritten)
  }
}

/**
 * Write the manifest to a file for debugging purposes.
 *
 * @param {{[key: string]: string}} manifest
 * @returns {Promise<void>}
 */
async function writeManifestFile(manifest) {
  await fs.writeFile(
    path.join(outputDirectory, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  console.log('Manifest:', manifest)
}

/**
 * Build the site.
 *
 * @returns {Promise<void>}
 */
async function main() {
  await deleteRecursively(outputDirectory)
  await createDirectoryRecursively(outputDirectory)

  const entryPoints = await findEntryPoints()
  const esbuildResult = await runEsbuild(entryPoints, outputDirectory)

  const manifest = createManifest(esbuildResult)

  await copyTree(inputDirectory, outputDirectory, {
    excludedExtensions: ['.js', '.css'],
  })

  await rewriteHtmlDocuments(manifest)

  await writeManifestFile(manifest)

  console.log('Build complete.')
}

try {
  await main()
} catch (error) {
  console.error(error)
  process.exit(1)
}
