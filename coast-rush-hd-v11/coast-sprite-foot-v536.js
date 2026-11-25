'use strict';

const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext('2d', {willReadFrequently: true});

function opaqueFoot(bitmap) {
 const {width, height} = bitmap;
 canvas.width = width;
 canvas.height = height;
 context.drawImage(bitmap, 0, 0);
 const minimum = Math.max(2, Math.ceil(width * .015));
 for (let end = height; end > 0; end -= 32) {
  const start = Math.max(0, end - 32);
  const data = context.getImageData(0, start, width, end - start).data;
  for (let y = end - 1; y >= start; y--) {
   let count = 0;
   for (let x = 0; x < width; x++) {
    if (data[((y - start) * width + x) * 4 + 3] > 80 && ++count >= minimum) {
     return (y + 1) / height;
    }
   }
  }
 }
 return 1;
}

self.onmessage = ({data: bitmap}) => {
 let foot = 1;
 try {
  foot = opaqueFoot(bitmap);
 } catch (_) {
 } finally {
  bitmap.close();
  self.postMessage(foot);
 }
};
