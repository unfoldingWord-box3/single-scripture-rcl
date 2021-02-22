// @ts-ignore
import {
  core,
  useRsrc,
} from 'scripture-resources-rcl'
import {
  ServerConfig,
  ScriptureResource,
  ScriptureReference,
} from '../types'
import { useResourceManifest } from './useResourceManifest'

interface Props {
  /** reference for scripture **/
  reference: ScriptureReference;
  /** where to get data **/
  config: ServerConfig;
  /** optional direct path to bible resource, in format ${owner}/${languageId}/${projectId}/${branch} **/
  resourceLink: string|undefined;
  /** optional resource object to use to build resourceLink **/
  resource: ScriptureResource|undefined;
}

export function useScripture({
  config,
  reference,
  resource: resource_,
  resourceLink: resourceLink_,
} : Props) {
  let resourceLink = resourceLink_

  if (resource_) {
    const {
      owner, languageId, projectId, branch = 'master',
    } = resource_ || {}
    resourceLink = `${owner}/${languageId}/${projectId}/${branch}`
  }

  const options = { getBibleJson: true }

  const {
    state: {
      bibleJson, matchedVerse, resource,
    },
  } = useRsrc({
    config, reference, resourceLink, options,
  })

  const { title, version } = useResourceManifest(resource)
  let { verseObjects } = bibleJson || {}
  const { languageId } = resource_ || {}

  if (languageId === 'el-x-koine' || languageId === 'hbo') {
    verseObjects = core.occurrenceInjectVerseObjects(verseObjects)
  }

  return {
    title,
    version,
    reference,
    resourceLink,
    matchedVerse,
    verseObjects,
  }
}