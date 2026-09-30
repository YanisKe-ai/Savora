# savora-text-recognition

Kleines eigenes Capacitor-Plugin für Savora. Liest Text aus einem Foto mit Apple Vision (`VNRecognizeTextRequest`), vollständig auf dem Gerät.

```js
const { text } = await Capacitor.Plugins.TextRecognition.recognize({ image: base64Jpeg });
```
