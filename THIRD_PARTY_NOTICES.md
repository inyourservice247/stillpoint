# Third-party notices

Stillpoint is based in part on the visual language and RSVP reader structure of
[snowfluke/rsvp-speed-reader](https://github.com/snowfluke/rsvp-speed-reader),
reviewed at commit `d594f645385c40ddb81943d4cf66fffbcf408e55`.

The original project is Copyright (c) 2026 Awal Ariansyah and licensed under
the MIT License. Its complete license is preserved at
`public/licenses/original-rsvp-speed-reader.txt`.
# Kokoro natural voice

Stillpoint optionally uses `kokoro-js` and the Kokoro-82M model for local, in-browser speech generation. Kokoro-82M model weights are licensed under Apache License 2.0. The model is downloaded only after the user enables it and is cached by the browser.

- Project: https://github.com/hexgrad/kokoro
- Browser library: https://github.com/huggingface/transformers.js
- Model: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
