const hostname = "127.0.0.1"; // localhost
const port = 3000;

Deno.serve({ hostname, port }, (request) =>{
  const url = new URL(request.url);

  let body = "";
  let status = 200;
  const headers = new Headers({
    "Content-Type": "text/plain",
    "Access-Control-Allow-Origin": "*", // CORS
  });

  switch (url.pathname) {
    case "/": // Request URL: http://localhost:3000/
      body = "Hello World";
      break;

    case "/search": // Request URL: http://localhost:3000/search?item=beispielWert
      body = "Hier ist was du suchst: " + url.searchParams.get("item");
      break;

    default:
      status = 404;
      body = "Not Found";
  }

  return new Response(body, { status, headers });
});

console.log(`Server läuft auf http://${hostname}:${port}/`);

