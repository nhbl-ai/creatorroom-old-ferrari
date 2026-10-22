// Original demo artwork generated in the browser. No protected preview or
// plaintext sample file is sent to the application server.
export async function sampleFile(variant = 0) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  const dark = variant === 0;
  context.fillStyle = dark ? "#21143e" : "#e0e6d8";
  context.fillRect(0, 0, 720, 900);
  if (dark) {
    for (let index = 0; index < 22; index++) {
      context.strokeStyle = index % 2 ? "#b4a0ec" : "#684bba";
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(
        360,
        470,
        90 + index * 13,
        90 + index * 7,
        -0.55,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
  } else {
    for (const [x, y, radius, color] of [
      [250, 420, 190, "#b1bfa7"],
      [460, 540, 180, "#e9bc9d"],
      [310, 615, 110, "#526a55"],
    ]) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.fillStyle = dark ? "#f7f2ff" : "#263d30";
  context.font = "700 87px sans-serif";
  context.fillText(dark ? "AFTER" : "QUIET", 62, 180);
  context.fillText(dark ? "HOURS." : "FORMS.", 62, 275);
  context.font = "15px sans-serif";
  context.fillText("CREATORROOM STUDIO / ORIGINAL DEMO ART", 65, 65);
  context.fillText("UNRELEASED CONCEPT — FOR YOUR EYES ONLY", 65, 820);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Your browser could not create the sample image.");
  return new File([blob], dark ? "after-hours.png" : "quiet-forms.png", {
    type: "image/png",
  });
}
