import * as React from 'react'
import useDeepCompareEffect from 'use-deep-compare-effect'
import { VerseObjects } from 'scripture-resources-rcl'
import { UsfmFileConversionHelpers } from 'word-aligner-rcl'
import { ScriptureReference } from '../../types'
import { getResourceMessage } from '../../utils'
import { ScriptureALignmentEditProps, useScriptureAlignmentEdit } from "../../hooks/useScriptureAlignmentEdit";
import { Container, Content } from './styled'

interface Props {
  /** optional styles to use for content **/
  contentStyle: any;
  // index number for this scripture pane
  currentIndex: number,
  /** language direction to use **/
  direction: string|undefined;
  /** if true then do not display lexicon popover on hover **/
  disableWordPopover: boolean|undefined;
  /** font size for messages */
  fontSize: number;
  /** function to get latest lexicon data */
  getLexiconData: Function;
  /** true if browsing NT */
  isNT: boolean;
  /** current reference **/
  reference: ScriptureReference;
  /** optional styles to use for reference **/
  refStyle: any;
  /** object that contains resource loading status or fetching errors */
  resourceStatus: object|undefined;
  /** resource that was loaded */
  resourceLink: string|undefined;
  /** true if currently saving updated text and alignments */
  saving: boolean;
  // initialization for useScriptureAlignmentEdit
  scriptureAlignmentEditConfig: ScriptureALignmentEditProps,
  /** server */
  server: string|undefined;
  /** callback to flag unsaved status */
  setSavedChanges: Function;
  /** optional function for localization */
  translate: Function;
}

const MessageStyle = {
  direction: 'ltr',
  whiteSpace: 'pre-wrap',
  lineHeight: 'normal',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
  width: '100%',
  fontSize: '16px',
  fontFamily: 'Noto Sans',
  fontWeight: 'bold',
}

const TextAreaStyle = {
  height: '60%',
  width: '100%',
  minWidth: '220px',
  fontSize: '16px',
}

function ScripturePane({
  reference,
  refStyle,
  direction,
  currentIndex,
  contentStyle,
  disableWordPopover,
  resourceStatus,
  resourceLink,
  server,
  isNT,
  fontSize,
  getLexiconData,
  translate,
  saving,
  scriptureAlignmentEditConfig,
  setSavedChanges,
} : Props) {
  const [state, setState_] = React.useState({
    urlError: null,
    doingAlignment: false,
  })
  const {
    urlError,
    doingAlignment,
  } = state

  function setState(newState) {
    setState_(prevState => ({ ...prevState, ...newState }))
  }

  const [initialVerseText, setInitialVerseText] = React.useState(null)
  const resourceMsg = saving ? 'Saving Changes...' : getResourceMessage(resourceStatus, server, resourceLink, isNT)
  const { chapter, verse } = reference
  direction = direction || 'ltr'

  refStyle = refStyle || {
    fontFamily: 'Noto Sans',
    fontSize: '90%',
  }

  contentStyle = contentStyle || {
    fontFamily: 'Noto Sans',
    fontSize: '100%',
  }

  const _scriptureAlignmentEditConfig = {
    ...scriptureAlignmentEditConfig,
    initialVerseText,
  }

  const _scriptureAlignmentEdit = useScriptureAlignmentEdit(_scriptureAlignmentEditConfig)
  const {
    actions: {
      currentVerseObjects,
      handleAlignmentClick,
      setEditing,
      setVerseChanged,
    },
    state: {
      aligned,
      alignerData,
      editing,
      unsavedChanges,
    },
  } = _scriptureAlignmentEdit

  React.useEffect(() => {
    if (alignerData && !doingAlignment) {
      // TODO: setWordAlignerStatus(_scriptureAlignmentEdit)
      setState({ doingAlignment: true })
    } else if (doingAlignment) {
      // TODO: setWordAlignerStatus(_scriptureAlignmentEdit)
      setState({ doingAlignment: false })
    }
  }, [_scriptureAlignmentEdit?.state?.alignerData])

  // dynamically adjust font size
  const calculatedFontSize = React.useMemo(() => (
    parseFloat(TextAreaStyle.fontSize) * fontSize / 100 + 'px'
  ), [fontSize])

  const textAreaStyle = {
    ...contentStyle,
    ...TextAreaStyle,
    fontSize: calculatedFontSize,
  }

  useDeepCompareEffect(() => {
    const verseText = UsfmFileConversionHelpers.getUsfmForVerseContent({ verseObjects: currentVerseObjects })
    setInitialVerseText(verseText)
  }, [{ reference, currentVerseObjects }])

  function onTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const newText = event?.target?.value
    const changed = newText !== initialVerseText
    setVerseChanged(changed, newText, initialVerseText)
  }

  function onBlur(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setEditing(false)
  }

  return (
    <Container style={{ direction, width: '100%', paddingBottom: '0.5em'}}>
      {resourceMsg ?
        // @ts-ignore
        <div style={MessageStyle}>
          <div style={{ fontSize: `${fontSize}%` }}> {resourceMsg} </div>
        </div>
        :
        <Content>
          <span style={refStyle}> {chapter}:{verse}&nbsp;</span>
          <span style={contentStyle} onClick={() => {
            setEditing && setEditing(true)
          }}
          >
            {editing ?
              <textarea
                defaultValue={initialVerseText}
                onChange={onTextChange}
                onBlur={onBlur}
                style={textAreaStyle}
                autoFocus
              />
              :
              <VerseObjects
                verseKey={`${reference.chapter}:${reference.verse}`}
                verseObjects={currentVerseObjects || []}
                disableWordPopover={disableWordPopover}
                getLexiconData={getLexiconData}
                translate={translate}
              />
            }
          </span>
        </Content>
      }
    </Container>
  )
}

ScripturePane.defaultProps = { verseObjects: [] }

export default ScripturePane
