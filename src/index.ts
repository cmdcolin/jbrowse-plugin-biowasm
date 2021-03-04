/* eslint-disable @typescript-eslint/camelcase */
import PluginManager from '@jbrowse/core/PluginManager'
import Plugin from '@jbrowse/core/Plugin'
import { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import { Region } from '@jbrowse/core/util/types'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import SimpleFeature, { Feature } from '@jbrowse/core/util/simpleFeature'
import {
  readConfObject,
  ConfigurationSchema,
} from '@jbrowse/core/configuration'
import { AnyConfigurationModel } from '@jbrowse/core/configuration/configurationSchema'
import { version } from '../package.json'

const configSchema = ConfigurationSchema(
  'BiowasmAdapter',
  {
    url: {
      type: 'string',
      defaultValue: '/path/to/file.bam',
    },
  },
  { explicitlyTyped: true },
)

function getAdapterClass(pluginManager: PluginManager) {
  const { jbrequire } = pluginManager
  const { BaseFeatureDataAdapter } = jbrequire(
    '@jbrowse/core/data_adapters/BaseAdapter',
  )

  return class AdapterClass extends BaseFeatureDataAdapter {
    private config: AnyConfigurationModel

    constructor(config: AnyConfigurationModel) {
      super(config)
      this.config = config
    }

    public async getRefNames(_: BaseOptions = {}) {
      return []
    }

    public getFeatures(query: Region, opts: BaseOptions = {}) {
      return ObservableCreate<Feature>(async observer => {
        observer.complete()
      }, opts.signal)
    }

    public freeResources(/* { region } */) {}
  }
}

export default class extends Plugin {
  name = 'MyGeneAdapter'
  version = version

  install(pluginManager: PluginManager) {
    const { jbrequire } = pluginManager
    const AdapterType = jbrequire(
      '@jbrowse/core/pluggableElementTypes/AdapterType',
    )
    const AdapterClass = getAdapterClass(pluginManager)
    pluginManager.addAdapterType(() => {
      return new AdapterType({
        name: 'BiowasmAdapter',
        configSchema,
        AdapterClass,
      })
    })
  }
}
