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
import { types } from 'mobx-state-tree'
import { Aioli } from '@biowasm/aioli'
import { version } from '../package.json'

function parseCigar(cigar: string) {
  return (cigar || '').split(/([MIDNSHPX=])/)
}

const configSchema = ConfigurationSchema(
  'BiowasmAdapter',
  {
    bamLocation: {
      type: 'fileLocation',
      defaultValue: { uri: '/path/to/file.bam' },
    },
    index: ConfigurationSchema('BamIndex', {
      indexType: {
        model: types.enumeration('IndexType', ['BAI', 'CSI']),
        type: 'stringEnum',
        defaultValue: 'BAI',
      },
      location: {
        type: 'fileLocation',
        defaultValue: { uri: '/path/to/my.bam.bai' },
      },
    }),
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
    private samtools: any
    private mountedFiles: any

    constructor(config: AnyConfigurationModel) {
      super(config)
      this.config = config
    }

    async setup() {
      if (!this.samtools) {
        const samtools = new Aioli('samtools/1.10')
        await samtools.init()
        this.samtools = samtools
      }
      return this.samtools
    }

    async mountFile() {
      if (!this.mountedFiles) {
        await this.setup()
        const bam = readConfObject(this.config, 'bamLocation')
        const bai = readConfObject(this.config, ['index', 'location'])
        const mountedBai = await Aioli.mount(bai.uri)
        const mountedBam = await Aioli.mount(bam.uri)
        this.mountedFiles = { mountedBam, mountedBai }
      }
      return this.mountedFiles
    }

    public async getRefNames(_: BaseOptions = {}) {
      const samtools = await this.setup()
      const { mountedBam } = await this.mountFile()
      const { stdout, stderr } = await samtools.exec(
        `view ${mountedBam.path} -H`,
      )
      if (stdout === '' && stderr !== '') {
        throw new Error(stderr)
      }
      return (stdout as string)
        .split('\n')
        .filter(line => line.startsWith('@SQ'))
        .map(line => {
          const [, SN] = line.split('\t')
          return SN.replace(/^SN:/, '')
        })
    }

    public getFeatures(query: Region, opts: BaseOptions = {}) {
      return ObservableCreate<Feature>(async observer => {
        const samtools = await this.setup()
        const { mountedBam } = await this.mountFile()
        const readData = await samtools.exec(
          `view ${mountedBam.path} ${query.refName}:${query.start}-${query.end}`,
        )

        if (readData && !readData.stdout) {
          throw new Error(readData.stderr)
        }

        ;(readData.stdout as string)
          .split('\n')
          .filter(f => !!f)
          .forEach(row => {
            const [, flagString, , startString, , CIGAR] = row.split('\t')
            const start = +startString
            const flags = +flagString
            const cigarOps = parseCigar(CIGAR)
            let length = 0
            for (let i = 0; i < cigarOps.length; i += 2) {
              const len = +cigarOps[i]
              const op = cigarOps[i + 1]
              if (op !== 'I' && op !== 'S' && op !== 'H') {
                length += len || 0
              }
            }

            observer.next(
              new SimpleFeature({
                start: start,
                end: start + length,
                CIGAR,
                flags,
                uniqueId: row,
              }),
            )
          })

        observer.complete()
      }, opts.signal)
    }

    public freeResources(/* { region } */) {}
  }
}

export default class extends Plugin {
  name = 'BiowasmPlugin'
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
