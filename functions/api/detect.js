export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const apiKey = env.ROBOFLOW_API_KEY || "HJIfMN4giW2BvXiUjJsH";
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing ROBOFLOW_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const reqData = await request.json();
    let imageBase64 = reqData.image || reqData.imageBase64 || "";

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ตัด Prefix data:image/...;base64, ออก
    if (imageBase64.includes(",")) {
      imageBase64 = imageBase64.split(",")[1];
    }

    // Endpoint ที่ถูกต้องตามหน้า Use Workflow (ไม่มีขีดล่างระหว่าง ai กับ object)
    const endpoint = "https://serverless.roboflow.com/0799-natkritta-silapachaisri/workflows/projectaiobject-detection";

    const roboflowResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: {
          image: {
            type: "base64",
            value: imageBase64
          }
        }
      })
    });

    if (!roboflowResponse.ok) {
      const errorText = await roboflowResponse.text();
      return new Response(
        JSON.stringify({
          error: "Roboflow workflow failed",
          upstreamStatus: roboflowResponse.status,
          details: errorText
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await roboflowResponse.json();

    // ดึง predictions ตามโครงสร้างจริงจาก outputs
    let predictions = [];
    if (result.outputs && Array.isArray(result.outputs) && result.outputs.length > 0) {
      const outputObj = result.outputs[0];
      if (outputObj.model_output && Array.isArray(outputObj.model_output.predictions)) {
        predictions = outputObj.model_output.predictions;
      } else if (Array.isArray(outputObj.predictions)) {
        predictions = outputObj.predictions;
      }
    }

    return new Response(
      JSON.stringify({
        predictions: predictions,
        raw: result
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function onRequestGet() {
  return new Response(
    JSON.stringify({ status: "ok", ready: true }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}