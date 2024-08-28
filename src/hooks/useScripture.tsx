// @ts-ignore
import {
  useEffect,
  useState,
} from 'react'
import { core } from 'scripture-resources-rcl'
import {
  CONTENT_NOT_FOUND_ERROR,
  ERROR_STATE,
  INITIALIZED_STATE,
  INVALID_MANIFEST_ERROR,
  LOADING_STATE,
  MANIFEST_NOT_LOADED_ERROR,
  SCRIPTURE_NOT_LOADED_ERROR,
} from 'translation-helps-rcl'
import useDeepCompareEffect from 'use-deep-compare-effect'
import { getVerses } from 'bible-reference-range'
import { isEqual } from '@react-hookz/deep-equal'
import { AlignmentHelpers, UsfmFileConversionHelpers } from 'word-aligner-rcl'
import {
  delay,
  fetchBibleBookCore,
  verseObjectsHaveWords,
} from '../utils'
import {
  cleanupVerseObjects,
  getBookNameFromUsfmFileName,
  getResourceLink,
  parseResourceLink,
} from '../utils/ScriptureSettings'
import {
  BookFetchParams,
  BookObjectsType,
  ScriptureResourceType,
  ScriptureReferenceType,
  ServerConfigType,
  VerseObjectsType,
  VerseReferencesType,
} from '../types'
import { parseResourceManifest } from './parseResourceManifest'

interface Props {
  /** reference for scripture **/
  reference: ScriptureReferenceType;
  /** where to get data **/
  config: ServerConfigType;
  /** optional direct path to bible resource, in format ${owner}/${languageId}/${projectId}/${branch} **/
  resourceLink: string|undefined;
  /** optional resource object to use to build resourceLink **/
  resource: ScriptureResourceType|undefined;
  /** if true then fetch the entire book */
  wholeBook: boolean;
  /** if true then settings are ready for fetching data */
  readyForFetch: boolean;
}

/**
 * extract branch from resource link
 * @param resourceLink
 */
function getBranchName(resourceLink: string) {
  let branch = null
  resourceLink = resourceLink || ''
  const parts = resourceLink.split('?ref=')

  if (parts.length > 1) { // if ref parameter found, get branch name after
    branch = parts?.[1]
  } else { // fall back to using useRsrc format such as "unfoldingWord/en/ust/master"
    const _parts = resourceLink.split('/')
    branch = _parts?.[3]
  }
  return branch
}

/**
 * get the verse objects for the reference string
 * @param {string} refStr - in format <chapter>:<verse>
 * @param {object} bookObjects - parsed usfm for book
 * @param {string} languageId
 * @return {array|null} - of verseObjects
 */
export function getVersesForRefStr(refStr, bookObjects, languageId): VerseReferencesType {
  if (bookObjects) {
    let verses = getVerses(bookObjects.chapters, refStr)

    if (languageId === 'el-x-koine' || languageId === 'hbo') {
      verses = verses.map(verse => {
        if ( verse?.verseData?.verseObjects) {
          let verseObjects_ = core.occurrenceInjectVerseObjects( verse.verseData.verseObjects)
          verseObjects_ = cleanupVerseObjects(verseObjects_)
          verse.verseData.verseObjects = verseObjects_
        }
        return verse
      })
    }

    return verses
  }
  return null
}

/**
 * get the verse objects for the reference object
 * @param {ScriptureReferenceType} reference
 * @param {object} bookObjects - parsed usfm for book
 * @param {string} languageId
 * @return {array|null} - of verseObjects
 */
export function getVersesForRef(reference, bookObjects, languageId): VerseReferencesType {
  const refStr = `${reference.chapter}:${reference.verse}`
  return getVersesForRefStr(refStr, bookObjects, languageId)
}

export function useScripture({ // hook for fetching scripture
  config,
  readyForFetch,
  reference,
  resource: resource_,
  resourceLink: resourceLink_,
  wholeBook = false,
} : Props) {
  type StateTypes = {
    bibleUsfm: string,
    bookObjects: BookObjectsType,
    fetchCount: number,
    fetched: boolean,
    fetchedBook: string,
    fetchParams: BookFetchParams|null,
    ignoreSha: string|null,
    initialized: boolean,
    resourceState: {
      bibleUsfm: string,
      bookObjects: BookObjectsType,
      content: {},
      fetchResponse: {},
      fetchedResources: {
        bibleUsfm: string,
        bookObjects: BookObjectsType,
        fetchCount: number,
        name: string,
        sha: string,
        url: string,
      },
      loadingResource: boolean,
      loadingContent: boolean,
      resource: {
        name: string,
        manifest: {},
        resourceLink: {}
      },
      sha: string,
      url: string,
    },
    versesForRef: any[],
  }

  const [state, setState_] = useState({
    bibleUsfm: null,
    bookObjects: null,
    fetchCount: 0,
    fetched: false,
    fetchedBook: '',
    fetchParams: null,
    ignoreSha: null,
    initialized: false,
    resourceState: {
      bookObjects: null,
      bibleUsfm: null,
      content: null,
      fetchResponse: null,
      fetchedResources: null,
      loadingResource: false,
      loadingContent: false,
      resource: null,
      sha: null,
      url: null,
    },
    versesForRef: [],
  })

  const {
    owner,
    languageId,
    branch = 'master',
    ref = null,
  } = resource_ || {}

  const { bookId } = reference || {}

  const _state: StateTypes = state // Tricky: work-around for bug that standard typescript type casting does not work in .tsx files
  const {
    bibleUsfm,
    bookObjects,
    fetchCount,
    fetched,
    fetchedBook,
    fetchParams,
    ignoreSha,
    initialized,
    resourceState,
    versesForRef,
  } = _state
  const fetchedResources = resourceState?.fetchedResources

  function setState(newState) {
    setState_(prevState => ({ ...prevState, ...newState }))
  }

  useEffect(() => {
    if (readyForFetch) {
      initiateBookFetch()
    }

    function initiateBookFetch() {
      console.log(`useScripture - readyForFetch true, initializing`)
      let resourceLink = readyForFetch && resourceLink_

      if (!resourceLink_ && resource_) {
        const ref_ = ref || branch

        resourceLink = getResourceLink({
          owner,
          languageId,
          resourceId: resource_?.projectId,
          ref: ref_,
        })
      }

      const bookRef = { ...reference }

      if (wholeBook) {
        delete bookRef.chapter // remove the chapter and verse so the whole book is fetched
        delete bookRef.verse
      }

      if (resourceLink !== fetchParams?.resourceLink) {
        console.log(`useScripture - for ${resource_?.projectId} resourceLink is now ${resourceLink} and resourceLink_=${resourceLink_}`)
      } else if (bookRef !== fetchParams?.reference) {
        console.log(`useScripture - book changed to ${resource_?.projectId} resourceLink is now ${resourceLink}`)
      }

      const newFetchParams = {
        config,
        reference: bookRef,
        resourceLink,
      }

      if (!isEqual(newFetchParams, fetchParams)) {
        setState({
          fetchParams: newFetchParams,
          fetched: false,
          initialized: true,
        })

        fetchBook(newFetchParams)
      }
    }
  }, [
    readyForFetch,
    owner,
    languageId,
    bookId,
    branch,
    ref,
  ])

  /**
   * do a fetch of manifest and book of the bible specified in fetchParams
   * @param {object} fetchParams
   * @param {string} ignoreSha - optional previous sha - ignore responses that came back for this previous book commit
   */
  async function fetchBook(fetchParams: BookFetchParams, ignoreSha = null) {
    try {
      const fetchLink = `${fetchParams?.resourceLink}/${fetchParams?.reference?.bookId}`

      if (ignoreSha) {
        const fetchedShaMatchesIgnoreSha = ignoreSha === resourceState?.sha // we will reload if ignoreSha given and it matches current sha
        if ((fetchLink === resourceState?.resource?.resourceLink) && !fetchedShaMatchesIgnoreSha) { // see if we already fetched this
          console.log(`useScripture.fetchBook() - Already fetching resourceLink ${resourceState?.resource?.resourceLink} and ignoreSha=${ignoreSha}`, fetchParams)
          return
        }
      }

      const _fetchCount = fetchCount + 1
      console.log(`useScripture.fetchBook() - FETCHING bible ${resource_?.projectId} resourceLink is now ${fetchParams?.resourceLink} and ignoreSha=${ignoreSha}`, fetchParams)
      setState({
        fetchCount: _fetchCount,
        fetched: false,
        ignoreSha,
        resourceState: {
          loadingResource: true,
          // reset states before fetch
          contentNotFoundError: false,
          scriptureNotLoadedError: false,
          manifestNotFoundError: false,
          invalidManifestError: false,
        },
      })

      const response = await fetchBibleBookCore(fetchParams)

      if (!response || response?.error) {
        console.log(`useScripture.warn() -Error FETCHING bible ${resource_?.projectId}`, response)
        setState({
          resourceState: {
            loadingResource: false,
            response,
          },
        })
        return
      }

      console.log(`useScripture.fetchBook() - LOADED bible book ${resource_?.projectId} resourceLink is now ${fetchParams?.resourceLink}}`, fetchParams)
      setState(
        {
          resourceState: {
            loadingResource: false,
            fetchedResources: {
              ...response,
              fetchCount: _fetchCount,
              reference: fetchParams?.reference,
            },
          },
        },
      )
    } catch (e) {
      console.error(`useScripture.fetchBook() - hard error loading resource`, fetchParams, e )
      setState({
        resourceState: {
          loadingResource: false,
          resource: null,
        },
      })
    }
  }

  useEffect(() => {
    console.log(`useScripture - for ${resource_?.projectId} readyForFetch is now ${readyForFetch}`)
  }, [readyForFetch])

  /**
   * make sure last fetch response is for current book/branch
   */
  function validateResponse() {
    let isSameBook = false
    // @ts-ignore
    const expectedBookId = bookId || 'zzz'
    const fetchedBook = getBookNameFromUsfmFileName(fetchedResources?.name)
    console.log(`useScripture.validateResponse() - Current bookId is ${bookId} and seeing ${fetchedBook} in USFM`)
    isSameBook = fetchedBook?.toLowerCase()?.includes(bookId)

    const sha = fetchedResources?.sha || null
    const url = fetchedResources?.url || null

    if (isSameBook) { // also make sure it is the same branch
      const fetchedBranch = getBranchName(url)
      const fetchingBranch = getBranchName(fetchParams?.resourceLink)

      if (fetchedBranch !== fetchingBranch) {
        console.log(`useScripture.validateResponse() invalid branch, expected branch is ${fetchingBranch}, but fetchedBranch is ${fetchedBranch}`, { sha, url })
        isSameBook = false
      }
    } else {
      console.log(`useScripture.validateResponse() -  invalid book, expectedBookId is ${expectedBookId}, but received book name ${fetchedBook}`, { sha, url })
    }

    if (ignoreSha === sha) {
      console.log(`useScripture.validateResponse() - the sha is the same as the ignore sha ${sha}`, { sha, url })
      isSameBook = false
    }

    if (isSameBook) {
      const bibleUsfm_ = fetchedResources?.bibleUsfm
      const bookObjects = fetchedResources?.bookObjects
      const versesForRef = getVersesForRef_(bookObjects)

      console.log(`useScripture.validateResponse() - correct book, expectedBookId is ${expectedBookId}`, { sha, url })
      const newState = {
        bibleUsfm: bibleUsfm_,
        bookObjects,
        fetched: true,
        fetchedBook: expectedBookId,
        ignoreSha: null,
        resourceState: {
          bookObjects,
          bibleUsfm: bibleUsfm_,
          loadingResource: false,
          loadingContent: false,
          resource: fetchedResources,
          sha,
          url,
        },
        versesForRef,
      }

      setState(newState)
    }
  }

  useDeepCompareEffect(() => { // validate response to make sure from latest request
    if (readyForFetch && fetchedResources) {
      if (!fetched && fetchedResources?.fetchCount === fetchCount) {
        delay(500).then(() => {
          validateResponse()
        })
      }
    }
  }, [{ readyForFetch, fetchedResources }])

  const resource = resourceState?.resource
  const { title, version } = parseResourceManifest(resource)
  const loading = resourceState?.loadingResource || resourceState?.loadingContent || !readyForFetch
  const contentNotFoundError = !resourceState?.bibleUsfm
  const scriptureNotLoadedError = !resourceState?.bookObjects
  const manifestNotFoundError = !resource?.manifest
  const invalidManifestError = !title || !version || !languageId
  const error = readyForFetch && initialized && !loading &&
    (contentNotFoundError || scriptureNotLoadedError || manifestNotFoundError || invalidManifestError)
  const resourceStatus = {
    [LOADING_STATE]: loading,
    [CONTENT_NOT_FOUND_ERROR]: contentNotFoundError,
    [SCRIPTURE_NOT_LOADED_ERROR]: scriptureNotLoadedError,
    [MANIFEST_NOT_LOADED_ERROR]: manifestNotFoundError,
    [INVALID_MANIFEST_ERROR]: invalidManifestError,
    [ERROR_STATE]: error,
    [INITIALIZED_STATE]: initialized,
  }

  useEffect(() => {
    if (!readyForFetch) {
      if (initialized) {
        setState({ intialized: false })
      }
    } else if (!initialized) {
      if (loading) { // once first load has begun, we are initialized
        setState({ intialized: true })
      }
    }
  }, [loading, readyForFetch])

  /**
   * get verses for ref
   * @param {string} refStr
   * @param {object} content_
   */
  function _getVersesForRef(refStr, content_ = bookObjects): VerseReferencesType {
    if (content_) {
      return getVersesForRefStr(refStr, content_, languageId)
    }
    return null
  }

  /**
   * update verse data for current book
   * @param {string} chapter
   * @param {string} verse
   * @param {object} verseData
   */
  function updateVerse(chapter, verse, verseData) {
    if (bookObjects) {
      const bookObjects_ = { ...bookObjects } // shallow copy

      if (bookObjects_?.chapters) {
        bookObjects_.chapters = { ...bookObjects_.chapters } // shallow copy chapters

        if (bookObjects_.chapters[chapter]) {
          bookObjects_.chapters[chapter] = { ...bookObjects_.chapters[chapter] } // shallow copy verses
          bookObjects_.chapters[chapter][verse] = verseData
          setState({ bookObjects: bookObjects_ })
          return bookObjects_
        }
      }
    }
    return null
  }

  /**
   * get the verses for current reference or reference range
   * @param {BookObjectsType} _bookObjects
   */
  function getVersesForRef_(_bookObjects: BookObjectsType = bookObjects): VerseObjectsType {
    let newVersesForRef = []

    if (_bookObjects) {
      newVersesForRef = getVersesForRef(reference, _bookObjects, languageId)
      if (reference?.verse === 'front') { // special handling for front matter
        const verseData = newVersesForRef?.[0]?.verseData
        const initialVerseObjects = verseData?.verseObjects
        if (initialVerseObjects && !verseObjectsHaveWords(initialVerseObjects)) {
          for (const vo of initialVerseObjects) {
            if (vo['tag'] === 'd') { // check for descriptive title
              // reparse so descriptive title text is broken into align-able words
              let verseText = UsfmFileConversionHelpers.getUsfmForVerseContent({ verseObjects: initialVerseObjects })
              const { targetVerseObjects } = AlignmentHelpers.updateAlignmentsToTargetVerse(initialVerseObjects, verseText)
              console.log(targetVerseObjects)
              verseData.verseObjects = targetVerseObjects // replace verseObjects with align-able content
              break
            }
          }
        }
      }
      return newVersesForRef
    }

    return null
  }

  /**
   * force reload of resource
   * @param {string|undefined} ignoreSha - optional sha to ignore
   * @param {string|undefined} ref - optional reference to fetch
   */
  function reloadResource(ignoreSha = null, ref = null) {
    console.log(`useScripture.reloadResource() ignoreSha: ${ignoreSha}` )
    const _fetchParams: BookFetchParams = { ...fetchParams }

    if (ref && fetchParams?.resourceLink) {
      const {
        owner,
        languageId,
        resourceId,
        ref: _ref,
      } = parseResourceLink(fetchParams.resourceLink)

      if (ref !== _ref) { // if ref changed, update resourcelink
        const _resourceLink = getResourceLink({
          owner,
          languageId,
          resourceId,
          ref,
        })
        console.log(`useScripture.reloadResource() old ref is different ${_ref}, switching to load ref: ${ref}, new resourceLink: ${_resourceLink}` )
        _fetchParams.resourceLink = _resourceLink
      }
    }
    fetchBook(_fetchParams, ignoreSha)
  }

  // @ts-ignore
  const currentBookRef = fetchParams?.reference?.bookId

  useEffect(() => {
    if (currentBookRef) {
      console.log(`useScripture fetched book changed to ${currentBookRef}, ${resourceLink_}`, fetchParams )
      setState({ bookObjects: null, bibleUsfm: null })
    }
    // @ts-ignore
  }, [currentBookRef])

  useEffect(() => {
    console.log(`useScripture book ref changed to ${bookId}, ${resourceLink_}`)
    // @ts-ignore
  }, [bookId])

  useEffect(() => {
    const expectedBookId = bookId || ''
    const fetchedBookSame = fetchedBook && (fetchedBook === expectedBookId)
    let _versesForRef = []

    if (!fetchedBookSame) {
      // if (expectedBookId && fetchedBook) {
      //   console.log(`useScripture expected book ${expectedBookId} but fetched book was ${fetchedBook} - clearing`)
      // }
    } else {
      const _bookObjects = fetchedBookSame ? bookObjects : null
      _versesForRef = getVersesForRef_(_bookObjects)
      // console.log(`useScripture _bookObjects is ${!!_bookObjects} and books are the same ${fetchedBook}`, { content, fetchParams })
    }

    if (!isEqual(_versesForRef, versesForRef)) {
      setState({ versesForRef: _versesForRef })
    }
  }, [reference])

  return {
    bibleUsfm,
    bookObjects,
    getVersesForRef: _getVersesForRef,
    reference: fetchParams?.reference,
    reloadResource,
    resourceLink: fetchParams?.resourceLink,
    resourceState, // state information for latest fetched resource
    resourceStatus, // status flags for fetched resource
    title,
    updateVerse,
    version,
    versesForRef,
  }
}
