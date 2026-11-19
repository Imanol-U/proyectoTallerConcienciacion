import "server-only";
import type { AnimationId } from "./animations";

/**
 * Instrucciones que recibe el modelo de vídeo, una por animación.
 *
 * Viven SOLO en el servidor y son fijas: el visitante elige un identificador
 * de la lista blanca y nunca puede escribir ni modificar el texto. Así nadie
 * puede pedir otra cosa que estas animaciones inofensivas, ni poner palabras en
 * boca de nadie (todas piden expresamente que la persona no hable).
 */
const COMMON =
  "Static camera, no zoom, no cuts. Keep the person's identity, face, hair, clothing, lighting and background exactly as in the image. " +
  "The person does not speak and the mouth forms no words. No text, no captions, no added objects, no other people. Photorealistic, natural motion.";

/**
 * Para las escenas: la foto llega como referencia de identidad (no como primer
 * fotograma), así que el vídeo arranca ya en el nuevo lugar. Se mantienen la
 * identidad, el silencio y la ausencia de texto y de otras personas.
 */
const SCENE_COMMON =
  "The scene is already in place from the very first frame: no transition, no fade, no morphing from another image. " +
  "One continuous shot, no cuts. The person has exactly the same face, facial features, skin tone, age, hairstyle and clothing as the person in the reference image, recognisable in every frame. " +
  "The person does not speak and the mouth forms no words. No text, letters, logos or captions anywhere, no other people. " +
  "Photorealistic, cinematic, smooth natural motion.";

export const PROMPTS: Readonly<Record<AnimationId, string>> = {
  saludo: `The person in the image looks at the camera, nods their head gently twice and smiles warmly. ${COMMON}`,
  sonrisa: `The person in the image starts with a serious neutral expression and slowly breaks into a wide, happy smile. ${COMMON}`,
  sorpresa: `The person in the image raises their eyebrows and opens their mouth in surprise, then relaxes. ${COMMON}`,
  guino: `The person in the image winks one eye playfully at the camera while tilting their head slightly, with a small smile. ${COMMON}`,
  teletransporte:
    "Cinematic medium close-up of the person from the reference image standing on a vivid nighttime city street in the rain: " +
    "glowing neon lights in pink and blue without any letters, wet pavement reflecting the colours, light rain falling, neon light and raindrops on their hair and clothes. " +
    "The camera slowly arcs around them at shoulder height. " +
    `They turn their head left and right, looking around in amazement at the place, then look straight into the camera with an astonished smile. ${SCENE_COMMON}`,
  escenario:
    "Cinematic medium shot of the person from the reference image standing on a huge concert stage at night, " +
    "lit by powerful spotlights with beams of light sweeping through haze, a vast audience visible only as a sea of out-of-focus lights, golden confetti falling. " +
    "The camera slowly orbits around them and rises slightly. " +
    `They look around in disbelief, laugh without words, then raise both arms in triumph and move their shoulders to the rhythm while the confetti falls around them. ${SCENE_COMMON}`,
};
