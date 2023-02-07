import path from 'path'
import fs from 'fs-extra'
import * as dependencies from './dependencies'
import componentIndexHtmlGenerator from './component-index-template'
import type { CypressComponentDependency } from './dependencies'
import debugLib from 'debug'
import semver from 'semver'

const debug = debugLib('cypress:scaffold-config:frameworks')

export type PkgJson = { version: string, dependencies?: Record<string, string>, devDependencies?: Record<string, string> }

export type WizardBundler = typeof dependencies.WIZARD_BUNDLERS[number]

export type CodeGenFramework = ResolvedComponentFrameworkDefinition['codeGenFramework']

type MaybePromise<T> = Promise<T> | T

export interface DependencyToInstall {
  dependency: CypressComponentDependency
  satisfied: boolean
  loc: string | null
  detectedVersion: string | null
}

export async function isDependencyInstalled (dependency: CypressComponentDependency, projectPath: string): Promise<DependencyToInstall> {
  try {
    debug('detecting %s in %s', dependency.package, projectPath)
    const loc = require.resolve(path.join(dependency.package, 'package.json'), {
      paths: [projectPath],
    })

    const pkg = await fs.readJson(loc) as PkgJson

    debug('found package.json %o', pkg)

    if (!pkg.version) {
      throw Error(`${pkg.version} for ${dependency.package} is not a valid semantic version.`)
    }

    const satisfied = Boolean(pkg.version && semver.satisfies(pkg.version, dependency.minVersion, {
      includePrerelease: true,
    }))

    debug('%s is satisfied? %s', dependency.package, satisfied)

    return {
      dependency,
      detectedVersion: pkg.version,
      loc,
      satisfied,
    }
  } catch (e) {
    debug('error when detecting %s: %s', dependency.package, e.message)

    return {
      dependency,
      detectedVersion: null,
      loc: null,
      satisfied: false,
    }
  }
}

function getBundler (bundler: WizardBundler['type']): CypressComponentDependency {
  switch (bundler) {
    case 'vite': return dependencies.WIZARD_DEPENDENCY_VITE
    case 'webpack': return dependencies.WIZARD_DEPENDENCY_WEBPACK
    default: throw Error(`Unknown bundler ${bundler}`)
  }
}

const mountModule = <T extends string>(mountModule: T) => (projectPath: string) => Promise.resolve(mountModule)

const reactMountModule = async (projectPath: string) => {
  const reactPkg = await isDependencyInstalled(dependencies.WIZARD_DEPENDENCY_REACT, projectPath)

  if (!reactPkg.detectedVersion || !semver.valid(reactPkg.detectedVersion)) {
    return 'cypress/react'
  }

  return semver.major(reactPkg.detectedVersion) === 18 ? 'cypress/react18' : 'cypress/react'
}

export const supportStatus = ['alpha', 'beta', 'full', 'community'] as const

export interface ResolvedComponentFrameworkDefinition {
  /**
   * A semantic, unique identifier.
   * Example: 'reactscripts', 'nextjs'
   */
  type: string

  /**
     * Used as the flag for `getPreset` for meta framworks, such as finding the webpack config for CRA, Angular, etc.
     * @see https://github.com/cypress-io/cypress/blob/ad0b2a37c2fe587f4efe4920d2e445eca5301600/npm/webpack-dev-server/src/devServer.ts#L119
     * This could be extended to be a function that a user can inject, eg:
     *
     * configFramwork: () => {
     *   return getSolidJsMetaFrameworkBundlerConfig()
     * }
     * It is also the name of the string added to `cypress.config`
     *
     * @example
     *
     * export default {
     *   component: {
     *     devServer: {
     *       framework: 'solid' // can be 'next', 'create-react-app', etc etc.
     *     }
     *   }
     * }
     */
  configFramework: string // 'create-react-app',

  /**
     * Library (React, Vue) or template (aka "meta framework") (CRA, Next.js, Angular)
     */
  category: 'library' | 'template'

  /**
     * Implement a similar interface to https://github.com/cypress-io/cypress/blob/ad0b2a37c2fe587f4efe4920d2e445eca5301600/npm/webpack-dev-server/src/devServer.ts#L117
     *
     * Only required for `category: framework`.
     *
     * @cypress/webpack-dev-server will need updating to receive custom `devServerHandler`.
     * @cypress/vite-dev-server does not currently support the concept of a framework config preset yet, but this can be added.
     *
     * NOTE: This could be a "fast follow" if we want to reduce the scope of this brief.
     */
  getDevServerConfig?: (projectPath: string, bundler: WizardBundler['type']) => MaybePromise<any>

  /**
     * Name displayed in Launchpad when doing initial setup.
     * @example 'Solid.js', 'Create React App'
     */
  name: string

  /**
     * Supported bundlers.
     */
  supportedBundlers: Array<typeof dependencies.WIZARD_DEPENDENCY_WEBPACK | typeof dependencies.WIZARD_DEPENDENCY_VITE>

  /**
     * Used to attempt to automatically select the correct framework/bundler from the dropdown.
     * @example
     *
     * const SOLID_DETECTOR: Dependency = {
     *   type: 'solid',
     *   name: 'Solid.js',
     *   package: 'solid-js',
     *   installer: 'solid-js',
     *   description: 'Solid is a declarative JavaScript library for creating user interfaces',
     *   minVersion: '^1.0.0',
     * }
     */
  detectors: CypressComponentDependency[]

  /**
     * Array of required dependencies. This could be the bundler and JavaScript library.
     * It's the same type as `detectors`.
     */
  dependencies: (bundler: WizardBundler['type'], projectPath: string) => Promise<DependencyToInstall[]>
  // dependencies: () => Promise<CypressComponentDependency[]>

  /**
     * @internal
     * This is used interally by Cypress for the "Create From Component" feature.
     * @example 'react'
     */
  codeGenFramework?: 'react' | 'vue' | 'svelte' | 'angular'

  /**
     * @internal
     * This is used interally by Cypress for the "Create From Component" feature.
     * @example '*.{js,jsx,tsx}'
     */
  glob?: string

  /**
     * This is the path to get mount, eg `import { mount } from <mount_module>,
     * @example: `cypress-ct-solidjs/src/mount`
     */
  mountModule: (projectPath: string) => Promise<string>

  /**
     * Support status. Internally alpha | beta | full.
     * Community integrations are "community".
     */
  supportStatus?: typeof supportStatus[number]

  /**
     * Function returning string for used for the component-index.html file.
     * Cypress provides a default if one isn't specified for third party integrations.
     */
  componentIndexHtml?: () => string

  /**
     * @internal
     */
  specPattern?: '**/*.cy.ts'
}

export const CT_FRAMEWORKS: ComponentFrameworkDefinition[] = [
  {
    type: 'reactscripts',
    configFramework: 'create-react-app',
    category: 'template',
    name: 'Create React App',
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK],
    detectors: [dependencies.WIZARD_DEPENDENCY_REACT_SCRIPTS],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        dependencies.WIZARD_DEPENDENCY_REACT_SCRIPTS,
        dependencies.WIZARD_DEPENDENCY_REACT_DOM,
        dependencies.WIZARD_DEPENDENCY_REACT,
      ]
    },
    codeGenFramework: 'react',
    glob: '*.{js,jsx,tsx}',
    mountModule: reactMountModule,
    supportStatus: 'full',
    componentIndexHtml: componentIndexHtmlGenerator(),
  },
  {
    type: 'vueclivue2',
    configFramework: 'vue-cli',
    category: 'template',
    name: 'Vue CLI (Vue 2)',
    detectors: [dependencies.WIZARD_DEPENDENCY_VUE_CLI_SERVICE, dependencies.WIZARD_DEPENDENCY_VUE_2],
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        dependencies.WIZARD_DEPENDENCY_VUE_CLI_SERVICE,
        dependencies.WIZARD_DEPENDENCY_VUE_2,
      ]
    },
    codeGenFramework: 'vue',
    glob: '*.vue',
    mountModule: mountModule('cypress/vue2'),
    supportStatus: 'full',
    componentIndexHtml: componentIndexHtmlGenerator(),
  },
  {
    type: 'vueclivue3',
    configFramework: 'vue-cli',
    category: 'template',
    name: 'Vue CLI (Vue 3)',
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK],
    detectors: [dependencies.WIZARD_DEPENDENCY_VUE_CLI_SERVICE, dependencies.WIZARD_DEPENDENCY_VUE_3],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        dependencies.WIZARD_DEPENDENCY_VUE_CLI_SERVICE,
        dependencies.WIZARD_DEPENDENCY_VUE_3,
      ]
    },
    codeGenFramework: 'vue',
    glob: '*.vue',
    mountModule: mountModule('cypress/vue'),
    supportStatus: 'full',
    componentIndexHtml: componentIndexHtmlGenerator(),
  },
  {
    type: 'nextjs',
    category: 'template',
    configFramework: 'next',
    name: 'Next.js',
    detectors: [dependencies.WIZARD_DEPENDENCY_NEXT],
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        dependencies.WIZARD_DEPENDENCY_NEXT,
        dependencies.WIZARD_DEPENDENCY_REACT,
        dependencies.WIZARD_DEPENDENCY_REACT_DOM,
      ]
    },
    codeGenFramework: 'react',
    glob: '*.{js,jsx,tsx}',
    mountModule: reactMountModule,
    supportStatus: 'full',
    /**
     * Next.js uses style-loader to inject CSS and requires this element to exist in the HTML.
     * @see: https://github.com/vercel/next.js/blob/5f3351dbb8de71bcdbc91d869c04bc862a25da5f/packages/next/build/webpack/config/blocks/css/loaders/client.ts#L24
     */
    componentIndexHtml: componentIndexHtmlGenerator([
      `<!-- Used by Next.js to inject CSS. -->\n`,
      `<div id="__next_css__DO_NOT_USE__"></div>`,
    ].join(' '.repeat(8))),
  },
  {
    type: 'nuxtjs',
    configFramework: 'nuxt',
    category: 'template',
    name: 'Nuxt.js (v2)',
    detectors: [dependencies.WIZARD_DEPENDENCY_NUXT],
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        dependencies.WIZARD_DEPENDENCY_NUXT,
        dependencies.WIZARD_DEPENDENCY_VUE_2,
      ]
    },
    codeGenFramework: 'vue',
    glob: '*.vue',
    mountModule: mountModule('cypress/vue2'),
    supportStatus: 'alpha',
    componentIndexHtml: componentIndexHtmlGenerator(),
  },
  {
    type: 'vue2',
    configFramework: 'vue',
    category: 'library',
    name: 'Vue.js 2',
    detectors: [dependencies.WIZARD_DEPENDENCY_VUE_2],
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK, dependencies.WIZARD_DEPENDENCY_VITE],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        getBundler(bundler),
        dependencies.WIZARD_DEPENDENCY_VUE_2,
      ]
    },
    codeGenFramework: 'vue',
    glob: '*.vue',
    mountModule: mountModule('cypress/vue2'),
    supportStatus: 'full',
    componentIndexHtml: componentIndexHtmlGenerator(),
  },
  {
    type: 'vue3',
    configFramework: 'vue',
    category: 'library',
    name: 'Vue.js 3',
    detectors: [dependencies.WIZARD_DEPENDENCY_VUE_3],
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK, dependencies.WIZARD_DEPENDENCY_VITE],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        getBundler(bundler),
        dependencies.WIZARD_DEPENDENCY_VUE_3,
      ]
    },
    codeGenFramework: 'vue',
    glob: '*.vue',
    mountModule: mountModule('cypress/vue'),
    supportStatus: 'full',
    componentIndexHtml: componentIndexHtmlGenerator(),
  },
  {
    type: 'react',
    configFramework: 'react',
    category: 'library',
    name: 'React.js',
    detectors: [dependencies.WIZARD_DEPENDENCY_REACT],
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK, dependencies.WIZARD_DEPENDENCY_VITE],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        getBundler(bundler),
        dependencies.WIZARD_DEPENDENCY_REACT,
        dependencies.WIZARD_DEPENDENCY_REACT_DOM,
      ]
    },
    codeGenFramework: 'react',
    glob: '*.{js,jsx,tsx}',
    mountModule: reactMountModule,
    supportStatus: 'full',
    componentIndexHtml: componentIndexHtmlGenerator(),
  },
  {
    type: 'angular',
    configFramework: 'angular',
    category: 'template',
    name: 'Angular',
    detectors: [dependencies.WIZARD_DEPENDENCY_ANGULAR_CLI],
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        dependencies.WIZARD_DEPENDENCY_ANGULAR_CLI,
        dependencies.WIZARD_DEPENDENCY_ANGULAR_DEVKIT_BUILD_ANGULAR,
        dependencies.WIZARD_DEPENDENCY_ANGULAR_CORE,
        dependencies.WIZARD_DEPENDENCY_ANGULAR_COMMON,
        dependencies.WIZARD_DEPENDENCY_ANGULAR_PLATFORM_BROWSER_DYNAMIC,
      ]
    },
    codeGenFramework: 'angular',
    glob: '*.component.ts',
    mountModule: mountModule('cypress/angular'),
    supportStatus: 'full',
    componentIndexHtml: componentIndexHtmlGenerator(),
    specPattern: '**/*.cy.ts',
  },
  {
    type: 'svelte',
    configFramework: 'svelte',
    category: 'library',
    name: 'Svelte.js',
    detectors: [dependencies.WIZARD_DEPENDENCY_SVELTE],
    supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK, dependencies.WIZARD_DEPENDENCY_VITE],
    dependencies: (bundler: WizardBundler['type']): CypressComponentDependency[] => {
      return [
        getBundler(bundler),
        dependencies.WIZARD_DEPENDENCY_SVELTE,
      ]
    },
    codeGenFramework: 'svelte',
    glob: '*.svelte',
    mountModule: mountModule('cypress/svelte'),
    supportStatus: 'alpha',
    componentIndexHtml: componentIndexHtmlGenerator(),
  },
]

const solidDep: CypressComponentDependency = {
  type: 'solid-js',
  name: 'Solid.js',
  package: 'solid-js',
  installer: 'solid-js',
  description: 'Solid is a declarative JavaScript library for creating user interfaces',
  minVersion: '^1.0.0',
}

type ComponentFrameworkDefinition = Omit<ResolvedComponentFrameworkDefinition, 'dependencies'> & {
  dependencies: (bundler: WizardBundler['type']) => CypressComponentDependency[]
}

export function resolveComponentFrameworkDefinition (definition: ComponentFrameworkDefinition): ResolvedComponentFrameworkDefinition {
  return {
    supportStatus: 'community',
    ...definition,
    dependencies: async (bundler, projectPath) => {
      const declaredDeps = definition.dependencies(bundler)

      // Must add bundler based on launchpad selection if it's a third party definition.
      if (definition.type.startsWith('cypress-ct-')) {
        declaredDeps.push(getBundler(bundler))
      }

      return await Promise.all(declaredDeps.map((dep) => isDependencyInstalled(dep, projectPath)))
    },
  }
}

// must be default export
export const solidJs: ComponentFrameworkDefinition = {
  type: 'cypress-ct-solid-js',

  configFramework: 'cypress-ct-solid-js',

  category: 'library',

  name: 'Solid.js',

  supportedBundlers: [dependencies.WIZARD_DEPENDENCY_WEBPACK, dependencies.WIZARD_DEPENDENCY_VITE],

  getDevServerConfig: (projectRoot, bundler) => {
    // console.log('running getDevServerConfig', projectRoot)
    const c = require(require.resolve('webpack.config.js', { paths: [projectRoot] }))

    // console.log(c)
    return c
  },

  detectors: [solidDep],

  // Cypress will include the bundler dependency here, if they selected one.
  dependencies: () => {
    return [solidDep]
  },

  mountModule: (projectPath: string) => Promise.resolve('cypress-ct-solid-js'),
}
