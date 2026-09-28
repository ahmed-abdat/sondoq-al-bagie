from PIL import Image, ImageFilter, ImageOps, ImageEnhance
import io, os
os.makedirs('var', exist_ok=True)
def jpeg(im,q):
    b=io.BytesIO(); im.convert('RGB').save(b,'JPEG',quality=q); b.seek(0); return Image.open(b).convert('RGB')
for name in ['bankily.png','sedad.jpg','masrvi-android.jpg','masrvi-ios.jpg']:
    base=name.split('.')[0]; im=Image.open('img/'+name).convert('RGB'); w,h=im.size
    v={}
    v['orig']=im
    v['whatsapp']=jpeg(im.resize((int(w*0.75),int(h*0.75)),Image.BILINEAR),30)   # re-forwarded, heavy compression
    v['lowres']=im.resize((int(w*0.5),int(h*0.5)),Image.BILINEAR)
    v['blur']=im.filter(ImageFilter.GaussianBlur(1.3))
    v['dark']=ImageOps.invert(im)                                                   # dark-mode like
    v['crop']=im.crop((0,int(h*0.2),w,int(h*0.8)))                                  # user cropped
    v['rot3']=im.rotate(3,expand=True,fillcolor=(255,255,255))
    v['dim']=ImageEnhance.Contrast(ImageEnhance.Brightness(im).enhance(0.6)).enhance(0.6)
    for k,x in v.items(): x.save(f'var/{base}__{k}.png')
print(len(os.listdir('var')))
