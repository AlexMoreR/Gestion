// Prueba local de la vista previa de color por parte (nov-2026). Trabaja solo con archivos: NO se
// conecta a la base ni escribe en public/uploads (usa una carpeta temporal).
//
// Uso (desde la raíz):
//   npm run vista-color:prueba -- --foto=portada.jpg --parte=tapizado.png:#E8DCC0 --parte=estructura.png:#C9A24A --salida=vista.webp
// Cada --parte es <máscara PNG>:<#RRGGBB> o <máscara PNG>:<foto de la muestra> (mosaico).
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { recolorear } from "../src/lib/recolor-image.server";

const valor = (nombre: string) => process.argv.find((arg) => arg.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);

async function main() {
  const foto = valor("foto");
  const salida = valor("salida") ?? "vista-color.webp";
  const partes = process.argv.filter((arg) => arg.startsWith("--parte=")).map((arg) => arg.slice("--parte=".length));
  if (!foto || partes.length === 0) {
    console.error("Falta --foto=<archivo> y al menos un --parte=<máscara.png>:<#RRGGBB o foto de muestra>.");
    process.exitCode = 1;
    return;
  }

  const carpeta = await mkdtemp(path.join(tmpdir(), "vista-color-prueba-"));
  try {
    const resultado = await recolorear({
      fotoBase: await readFile(foto),
      partes: await Promise.all(
        partes.map(async (parte) => {
          const corte = parte.lastIndexOf(":");
          const mascara = await readFile(parte.slice(0, corte));
          const color = parte.slice(corte + 1);
          return color.startsWith("#") ? { mascara, hex: color } : { mascara, texturaUrl: await readFile(color) };
        }),
      ),
      uploadsRoot: carpeta,
    });
    if (!resultado) {
      console.log("Sin vista previa de color: a alguna parte le falta máscara o color.");
      return;
    }
    await copyFile(path.join(carpeta, resultado.url.replace("/uploads/", "")), salida);
    console.log(`Listo: ${salida} (${resultado.buffer.length} bytes)`);
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
