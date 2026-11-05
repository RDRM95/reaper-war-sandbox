export class RNG {
  private value: number;
  constructor(seed: number) {this.value = (seed | 0) || 0x6d2b79f5;}
  next(): number {let x=this.value;x^=x<<13;x^=x>>>17;x^=x<<5;this.value=x;return (x>>>0)/4294967296;}
  between(min:number,max:number):number{return min+(max-min)*this.next();}
  int(max:number):number{return Math.floor(this.next()*max);}
}
