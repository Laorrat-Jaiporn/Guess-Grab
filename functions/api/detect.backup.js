export async function onRequest(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (context.request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (context.request.method === "GET") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const API_KEY = "HJIfMN4giW2BvXiUjJsH";
    // ใช้ endpoint มาตรฐานของ Roboflow Hosted Inference
    const INFERENCE_URL = `https://detect.roboflow.com/projectai_object-detection/1?api_key=${API_KEY}`;

    let base64Image = "";
    const contentType = context.request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await context.request.json();
      base64Image = json.image || json.base64 || json.data || "";
    } else {
      base64Image = await context.request.text();
    }

    if (typeof base64Image === "string" && base64Image.includes(",")) {
      base64Image = base64Image.split(",")[1];
    }

    console.log("==> [1. Frontend ยิงมาแล้ว] ขนาดรูป:", base64Image ? base64Image.length : 0);

    const roboflowResponse = await fetch(INFERENCE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: base64Image,
    });

    console.log("==> [2. Roboflow ตอบกลับรหัส HTTP]:", roboflowResponse.status);

    const rawData = await roboflowResponse.json();
    console.log("==> [3. ผลจาก Roboflow]:", JSON.stringify(rawData));

    const predictions = Array.isArray(rawData.predictions) ? rawData.predictions : [];

    return new Response(
      JSON.stringify({ predictions }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("==> [Error Worker Crash]:", error.message);
    // ส่ง 200 กลับไปเสมอเพื่อไม่ให้หน้าบ้านขึ้นสีแดงว่า Detection service unavailable
    return new Response(
      JSON.stringify({ predictions: [] }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}