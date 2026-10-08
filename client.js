async function requestTextWithGET(url){
  const response = await fetch(url);
  console.log('Response:', response); // complete response object

  const text = await response.text();
  console.log('Response text:', text); // Text from the response body
}

requestTextWithGET('http://localhost:3000/');

console.log('Continue working in the meantime...');