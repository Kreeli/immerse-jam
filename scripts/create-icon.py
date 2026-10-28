from PIL import Image, ImageDraw
image=Image.new('RGBA',(256,256));mask=Image.new('L',(256,256));ImageDraw.Draw(mask).rounded_rectangle((8,8,248,248),radius=62,fill=255)
for y in range(256):
    for x in range(256):
        t=(x+y)/510;image.putpixel((x,y),(int(240-39*t),int(143-83*t),int(167-65*t),mask.getpixel((x,y))))
d=ImageDraw.Draw(image)
for x,a,b in [(60,108,148),(94,76,180),(128,53,203),(162,86,170),(196,110,146)]:
    d.line((x,a,x,b),fill='#fff4fa',width=14);d.ellipse((x-7,a-7,x+7,a+7),fill='#fff4fa');d.ellipse((x-7,b-7,x+7,b+7),fill='#fff4fa')
image.save('assets/app-icon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
