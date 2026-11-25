#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2D terrain, geometry, material, skyMap, bubbles, palette;
uniform sampler2DArray paintings;
uniform ivec2 origin, worldOrigin;
uniform int viewHeight;
uniform float seconds, sunlight;
uniform float currents[5], stage[5];
uniform int pulseCount,pulseCourse[16];
uniform vec4 pulses[16];
layout(location=0) out vec4 surface;
layout(location=1) out vec4 distortion;
const float tau=6.28318530718;
const float rad=tau/256.0;
float sat(float v){return clamp(v,0.0,1.0);}
float sine(float p){return sin(p*rad);}
float cosine(float p){return cos(p*rad);}
float cell(vec2 uv){return texelFetch(bubbles,ivec2(floor(uv))&127,0).r;}
vec3 band(int ramp,float index){return texelFetch(palette,ivec2(clamp(int(index),0,31),ramp),0).rgb;}
vec3 paint(int layer,vec2 uv){return texelFetch(paintings,ivec3(ivec2(floor(uv))&63,layer),0).rgb;}
float loopFrame(float f){return 6.0-abs(6.0-mod(f,12.0));}
float riverSpark(ivec2 p,float t,float grain){
  ivec2 c=ivec2(floor(vec2(p)/vec2(15.,11.)));
  int seed=((c.x*73)^(c.y*151)^(c.x*c.y*17))&255;
  float flare=sine(float(seed)+t*43.);
  if(flare<.47||(seed&3)==0)return 0.;
  ivec2 d=abs(p-c*ivec2(15,11)-ivec2(3+seed%9,2+(seed>>3)%7));
  float peak=(flare-.47)/.53;
  if(d.x+d.y==0)return peak*(.64+.36*grain);
  if((d.x==0&&d.y==1)||(d.y==0&&d.x<=2))return max(0.,(peak-.67)*2.4)*(d.x+d.y==1?.85:.46);
  return 0.;
}
void main(){
  ivec2 screen=ivec2(int(gl_FragCoord.x),viewHeight-1-int(gl_FragCoord.y));
  ivec2 local=screen-origin;
  vec4 g=texelFetch(geometry,local,0);
  if(g.x< -5.0)discard;
  vec2 pixel=vec2(worldOrigin+local);
  vec2 world=vec2(pixel.y+pixel.x*.5,pixel.y-pixel.x*.5)/6.0;
  float x=world.x,z=world.y,depth=g.x,along=g.y,side=g.z,t=seconds;
  vec4 mat=texelFetch(material,local,0);
  int course=int(mat.r*255.0+.5);
  bool ocean=course==0, basin=mat.a>.5;
  float n=mat.g,pocket=mat.b,clock=currents[course];
  vec4 phase=tau*(vec4(
    x*.060+z*.020+.17*sin(z*.152+x*.039)+.093*sin(z*.32-x*.12)-max(0.,7.-depth)*.037,
    x*.097-z*.062+.19*sin(x*.133+z*.072),
    x*.12+z*.16+.14*cos(x*.21-z*.13),
    z*.039-x*.017+.21*cos(z*.081+x*.048))-t*vec4(.192,.255,.352,.042));
  vec3 normalPhase=phase.xyz+dot(sin(phase.xyz),vec3(.58,.31,.11))*rad*vec3(9.,4.,17.);
  vec3 waves=sin(normalPhase), slopes=cos(normalPhase);
  vec3 theta=mod(normalPhase/rad,256.);
  float a=theta.x,b=theta.y,c=theta.z,envelope=sin(phase.w);
  float reach=ocean?.08+.60*sine(a+25.)+.24*sine(b+9.):
    basin?.09*sine(t*26.+along*8.):-.20+.51*stage[course]+.095*sine(along*5.-clock);
  float cover=depth+reach;
  vec3 ground=texelFetch(terrain,local,0).rgb;
  float damp=sat((depth+(ocean?1.28:.96))/(ocean?1.67:1.42));
  vec3 earth=mix(ground,vec3(58.,70.,61.)/255.,damp*(ocean?.355:.48));
  if(cover<=0.){surface=vec4(earth,1.);distortion=vec4(.5,.5,0.,0.);return;}
  vec4 skySample=texelFetch(skyMap,local,0);
  vec3 sky=skySample.rgb,deep;
  vec2 normal;
  float clarity,foam=0.,shine=0.,mirror;
  float frame=loopFrame(floor(t*(ocean?2.7:1.55))+floor(mod((phase.w/tau+t*.042)*256.,4.)));
  if(ocean){
    float h=dot(waves,vec3(.55,.32,.13)),slope=dot(slopes,vec3(.57,.35,.22)),crosswind=dot(slopes,vec3(.18,-.48,.34));
    normal=vec2(slope*3.3+crosswind*2.3,h*1.85);
    vec2 uv=vec2(pixel.x*.72+8.1*sin(z*.18+x*.09),pixel.y*.93+5.2*cos(x*.20+z*.11))+normal*vec2(1.4,2.5)-vec2(0.,t*1.3);
    float ink=mix(sat((paint(7+int(frame),uv).g*255.-185.)/38.),sat((paint(int(frame),uv).g*255.-66.)/112.),smoothstep(1.5,5.5,cover));
    float crest=mod(a+14.*waves.y+7.*waves.z,256.),other=mod(b+11.*waves.z+8.*waves.x,256.);
    float crown=abs(crest-62.),face=sat(1.-abs(crest-93.)/38.),back=sat(1.-abs(crest-42.)/23.);
    float underlip=sat(1.-abs(crest-76.)/17.)*sat((waves.y+1.)*.53);
    float level=13.+h*3.4-slope*5.1-crosswind*2.7+face*3.7-back*3.4+underlip*4.3+ink*3.+envelope;
    deep=mix(band(1,12.+level*.65+crosswind*2.),band(0,level),.23+sat((cover-1.)/8.)*.77);
    deep=mix(deep,sky,(8.+max(0.,-slope)*13.)/256.);
    float wind=sat((sine(b+15.)*.53+envelope*.21+n*.67+.05)*1.23);
    float rim=sat(1.-crown/(2.4+wind*4.6)),glance=sat(.28-slope*.54+crosswind*.2+face*.37);
    shine=ink*(.14+glance*.45)+rim*wind*(.10+.15*sunlight);
    float webSeed=cell(pixel*vec2(.70,1.12)+normal*4.+t*vec2(-2.6,.85));
    float fine=cell(pixel*vec2(1.45,1.86)+vec2(normal.y*5.+t*1.2,n*7.));
    float fieldA=sat(1.-abs(crest-65.)/(8.+wind*23.))*wind;
    float fieldB=sat(1.-abs(other-68.)/14.)*sat((sine(a+17.)+n-.48)*1.25);
    float coverage=sat((max(fieldA,fieldB*.74)-.21)*1.43);
    float cap=coverage*(.19+.72*sat((coverage*.87-webSeed)*3.7)+.17*sat((coverage*.56-fine)*3.5));
    float lace=sine(a*3.+22.*waves.z)+cosine(c*3.+21.*slopes.y);
    float wash=mod(depth*22.+t*39.+12.*sin(phase.w+t*tau*.042+9.*rad)+7.*sin(phase.y+t*tau*(.255-.042)),128.);
    float front=sat(1.-abs(wash-39.)/(4.5+n*6.8)),washDepth=sat(1.-cover/5.4);
    float fringe=sat(1.-cover/(.11+.18*n))*(.46+.49*n);
    float backwash=(wash>42.&&wash<62.&&abs(lace)<.16)?(.30-(wash-42.)*.012)*washDepth:0.;
    foam=max(max(fringe,front*washDepth*(.31+.69*(1.-webSeed))),max(backwash,cap*.92));
    clarity=cover*(.45+.06*h);mirror=.65-.13*abs(slope);
  }else{
    float run=clock*.029,slow=along-run,fast=along-run*1.46;
    float sweep=sine(slow*9.+39.*sine(along*3.))+pocket*sine(slow*23.+side*14.);
    float line=sat(1.-abs(mod(side*60.+sweep*35.+21.*sine(fast*18.+side*25.),127.)-52.)/9.);
    float chop=mod(slow*34.+side*18.+22.*sine(side*43.+fast*5.),127.);
    float breaks=sat((sine(fast*27.+side*31.)+.43*cosine(slow*32.+side*8.)+.10)*1.65);
    float rip=sine(slow*15.+side*28.),rip2=cosine(fast*23.-side*26.),pulse=sine(along*49.-t*51.);
    normal=basin?vec2(pulse*.69,cosine(along*42.-t*53.)*.55):
      vec2(rip*.86+rip2*.63+pocket*sine(fast*31.)*1.8,sine(fast*18.+side*17.)*.82);
    float curl=pocket*sine(fast*39.+side*33.+19.*sweep);
    if(!basin)normal+=vec2(curl*1.45,pocket*cosine(slow*32.-side*41.)*1.18);
    vec2 uv=basin?world*3.1:vec2(side*5.5,along*3.1);
    float ink=sat((paint((basin?21:14)+int(frame),uv+normal-vec2(0.,clock*.12)).g*255.-85.)/107.);
    float channel=sat(cover/max(.42,g.w*.85)),grainLine=cell(vec2(along*6.8-run*9.+18.*sine(side*35.),side*15.+sweep*3.5));
    float riffle=sat(1.-abs(chop-61.)/8.)*sat((cosine(fast*12.-side*43.)+.12)*1.15);
    float level=13.+(1.-channel)*6.+rip*3.8+rip2*2.8+ink*3.+riffle*3.+(basin?0.:cosine(fast*12.+side*31.+17.*sweep)*1.8+curl*2.1);
    deep=mix(band(basin?3:2,level),sky,basin?.11:.074);
    float rings=sat((pulse-.915)*12.)*sat(1.-along/6.5)*(.22+.26*n);
    shine=basin?rings+ink*.23:line*breaks*(.26+.26*(1.-grainLine))+riffle*(.20+.17*breaks)+ink*(.17+.16*breaks);
    foam=basin?0.:max(max(pocket*(line+riffle*.65)*(.24+.54*breaks),riffle*.29*sat(1.-cover/1.8)*(1.-grainLine)),sat(1.-cover/.12)*.19*breaks);
    if(!basin)foam=max(foam,pocket*sat((curl-.12)*1.35)*(.28+.36*breaks));
    if(!basin){
      float bow=mat.a*2.04,wash=.57+.31*sine(fast*35.+side*44.)+.12*cosine(fast*18.);
      foam=max(foam,max(bow*wash*(.68+stage[course]*.32),pocket*riffle*breaks*.65));shine+=bow*.21;
    }
    clarity=basin?cover*.58:cover*.57+channel*.31;mirror=basin?.82:.57+.31*channel-.13*pocket;
    for(int i=0;i<pulseCount;i++){
      if(pulseCourse[i]!=course)continue;
      vec4 pulse=pulses[i];vec2 offset=world-pulse.xy;
      if(any(greaterThan(abs(offset),vec2(pulse.z+.7))))continue;
      float d=length(offset),delta=d-pulse.z,env=max(0.,1.-abs(delta)/.66);
      float strength=env*env*pulse.w,grad=cos(delta*8.5)*strength/max(d,.15);
      normal+=vec2((offset.x-offset.y)*2.9,(offset.x+offset.y)*1.116)*grad;
      float crest=max(0.,sin(delta*8.5+.7))*strength;shine+=crest*.68;foam=max(foam,crest*.43);
    }
  }
  float section=sat(max(0.,depth)/max(.8,g.w));
  float bedDepth=ocean?min(5.5,max(0.,depth)*.34)*(.91+.18*n):min(2.65,.54+g.w*.38)*section*(2.-section)*(.83+.32*n);
  vec2 floorUV=floor((world-vec2(bedDepth*.86))*3.8);
  vec3 bed=mix(paint(ocean?28:29,floorUV+round(normal*vec2(1.25,1.65))),(ocean?vec3(30.,61.,63.):vec3(62.,142.,159.))/255.,ocean?.344:.328);
  if(!ocean){
    float gravel=cell(mod(floorUV,64.)*vec2(1.2,1.14)+normal);
    bed=mix(bed,(gravel<.12?vec3(88.,99.,133.):vec3(194.,203.,159.))/255.,gravel<.12?.433:gravel*.188);
  }
  bed=mix(earth,bed,sat(cover/(ocean?1.7:1.05)));
  vec3 color=mix(deep,bed,exp(-clarity*1.36));
  float shelter=skySample.a;
  color=mix(color,vec3(22.,42.,44.)/255.,shelter*.3984);
  shine*=1.-shelter*.76;foam*=1.-shelter*.34;
  color=mix(color,vec3(186.,199.,174.)/255.,min(.68,shine)*.855*sat(cover/.25));
  color=mix(color,(ocean?(foam>.35?vec3(212.,221.,191.):vec3(147.,173.,151.)):(foam>.35?vec3(222.,246.,218.):vec3(146.,211.,209.)))/255.,sat(foam)*.949);
  float sparkle=ocean?0.:riverSpark(worldOrigin+local,t,n)*(1.-shelter*.96)*sat(cover/.3);
  color=mix(color,vec3(237.,253.,208.)/255.,sparkle*.977);mirror*=1.-sparkle*.85;
  surface=vec4(floor(color*255.+.5)/255.,1.);
  distortion=vec4((round(normal)+8.)/16.,sat(mirror*sat(cover/(ocean?1.07:.60))*(1.-foam*.93)),1.);
}
