# models/

Drop a `.gguf` file in here and KOVAI picks it up. There is no import step and
nothing to register — the runtime lists what is on disk, and the first runnable
file becomes the default unless you name one with `KOVAI_DEFAULT_MODEL`.

```
models/
  your-model-Q4_K_M.gguf              ← chat
  your-model.mmproj-Q8_0.gguf         ← optional: adds vision to the model above
```

A `*.mmproj*.gguf` sitting beside a model is paired with it automatically, which
is what turns a text model into one that can look at an image.

## Where to get one

[Hugging Face](https://huggingface.co/models?library=gguf) hosts most of them.
Quantisation trades quality for memory: `Q4_K_M` is the usual starting point,
`Q8_0` is close to the original and roughly twice the size. As a rough guide the
file has to fit in RAM with room to spare, so on a 16 GB machine stay under
about 10 GB.

## Why this folder is almost empty in git

Weights are gigabytes of binary and belong to whoever published them, so only
this README is tracked. Everything you put here is ignored —
see [`.gitignore`](../.gitignore).

## No local models?

KOVAI runs fine without any. Cloud providers cover chat, vision and image
generation, and the local runtime simply reports nothing to load.
