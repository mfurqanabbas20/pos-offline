"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

/* Minimal typings for the Web Speech API (not in TypeScript's DOM lib). */
interface SpeechRecognitionAlternative {
  transcript: string
}
interface SpeechRecognitionResult {
  isFinal: boolean
  0: SpeechRecognitionAlternative
}
interface SpeechRecognitionEvent {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResult>
}
interface SpeechRecognitionErrorEvent {
  error: string
}
interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

function getRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow it in the browser’s site settings.",
  "service-not-allowed": "Speech recognition isn’t allowed on this page.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection.",
  "no-speech": "Didn’t catch that — try again.",
}

const noopSubscribe = () => () => {}

interface Options {
  lang?: string
  /** Called with live (interim) text while the user is speaking. */
  onInterim?: (text: string) => void
  /** Called once with the final recognised phrase. */
  onResult: (text: string) => void
  onError?: (message: string) => void
}

/** One-shot speech-to-text: start() listens for a single phrase, then stops by itself. */
export function useSpeechRecognition({ lang = "en-US", onInterim, onResult, onError }: Options) {
  // Support can only be known in the browser; render as unsupported on the server.
  const supported = useSyncExternalStore(noopSubscribe, () => !!getRecognitionCtor(), () => false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // Keep the latest callbacks without restarting recognition when they change.
  const callbacks = useRef({ onInterim, onResult, onError })
  useEffect(() => {
    callbacks.current = { onInterim, onResult, onError }
  })

  useEffect(() => () => recognitionRef.current?.abort(), [])

  const stop = useCallback(() => recognitionRef.current?.stop(), [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    recognitionRef.current?.abort()

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interim = ""
      let final = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) final += result[0].transcript
        else interim += result[0].transcript
      }
      if (final) callbacks.current.onResult(cleanTranscript(final))
      else if (interim) callbacks.current.onInterim?.(cleanTranscript(interim))
    }
    recognition.onerror = (event) => {
      if (event.error === "aborted") return
      callbacks.current.onError?.(ERROR_MESSAGES[event.error] ?? `Speech recognition failed (${event.error}).`)
    }
    recognition.onend = () => {
      setListening(false)
      if (recognitionRef.current === recognition) recognitionRef.current = null
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [lang])

  return { supported, listening, start, stop }
}

/** Speech engines add capitals and trailing punctuation ("Paracetamol."); strip them for searching. */
function cleanTranscript(text: string) {
  return text.trim().replace(/[.,!?;:]+$/g, "").replace(/\s+/g, " ")
}
