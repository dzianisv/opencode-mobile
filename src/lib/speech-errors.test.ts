import test from "node:test"
import assert from "node:assert/strict"
import { isBenignSpeechError } from "./speech-errors.ts"

test("no-speech is benign — the user just didn't say anything", () => {
  assert.equal(isBenignSpeechError("no-speech"), true)
})

test("aborted is benign — Android emits it for every abort(), including cleanup on unrelated screens", () => {
  assert.equal(isBenignSpeechError("aborted"), true)
})

test("real failures still surface", () => {
  assert.equal(isBenignSpeechError("not-allowed"), false)
  assert.equal(isBenignSpeechError("network"), false)
  assert.equal(isBenignSpeechError("audio-capture"), false)
  assert.equal(isBenignSpeechError(undefined), false)
})
