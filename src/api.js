import React from "react";


export default class Api extends React.Component {

    state = {
        loading: true
      };

    async componentDidMount() {

        const API_KEY_URL = '&apikey=833VEJQ7YVTXDR9PAIVG7JJC595XX164T6';
        const bscsanBaseUrl = 'https://api.bscscan.com/api?';
        const contractTxUrl = 'module=account&action=txlist';
        const tokenTxUrl = 'module=account&action=tokentx';
        const ffAddress = '0x2152aa45e02c1022cAB4ad964663fB3D69C2023e'; 
        const busdAddr = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
        const ffStartBlock = 	"&startblock=23556338";
        const apiContractTx = bscsanBaseUrl + contractTxUrl + "&address=" + ffAddress
         + ffStartBlock + "&endblock=99999999&page=1&offset=5000&sort=asc" + API_KEY_URL;
        const apiTokenTx = bscsanBaseUrl + tokenTxUrl + "&contractaddress=" + busdAddr
         + "&address=" + ffAddress
         + ffStartBlock + "&endblock=99999999&page=1&offset=10000&sort=asc" + API_KEY_URL;
         
        var results = await fetch(apiContractTx);
        var result = await results.json();
        var data = result.result;
        
        var results2 = await fetch(apiTokenTx);
        var result2 = await results2.json();
        var data2 = result2.result;

        var wallets = {};
        var txs = {};
        var txVals = {};

        var remainingNfts = 5000;
        var stakeNum = 0;

        //for each FF transation store the value
        for (let i = 0; i<data2.length; i++){
            if(!(data2[i].hash in txVals)){
                txVals[data2[i].hash] = BigInt(0);
            }
            txVals[data2[i].hash] += BigInt(data2[i].value);
        }

        //for each transaction, calculate potential nfts
        for (let i = 0; i<data.length; i++){
            var h = data[i].hash;
            var from = data[i].from;
            var v = 0;
            var nfts = 0;
            
            //if transaction didnt fail, calculate potential nfts
            if(h in txVals){ 
                v = Number(txVals[h])/1e18;
                nfts = Math.floor(v/100);
            }
            //if wallet isnt stored, add it
            if(!(from in wallets)){ 
                wallets[from] = {};
            }
            //if this is a stake, store transaction values. Compounds dont count.
            if(data[i].methodId == "0x3acb1a0a"){
                //each transaction is an array[5]
                //[hash, stakeNum, time, value, nfts, assigned nfts]
                var tx = [from,stakeNum,data[i].timeStamp,v,nfts,0];
                var txW = [h,stakeNum,data[i].timeStamp,v,nfts,0];
                txs[h] = tx;
                wallets[from][h] = txW;
                stakeNum++;
            }
            //if this is an unstake, store values but negative. 
            //Compound unstakes count against but only if they are more than $100
            if(data[i].methodId == "0xcf4fef4f"){
                v = v*-1.0;
                nfts = nfts*-1;
                var tx = [from,-1*stakeNum,data[i].timeStamp,v,nfts,0];
                var txW = [h,-1*stakeNum,data[i].timeStamp,v,nfts,0];
                txs[h] = tx;
                wallets[from][h] = txW;
                stakeNum++;
            }
        }

        //after all transactions are calculated for potential and organized by wallet
        //iterate through transactions again and assign nfts
        for (var hash of Object.keys(txs)){
            if(txs[hash][1]<0){
                continue; //Don't assign nfts for an unstake
            }
            
            var from = txs[hash][0];
            var sNum = Math.abs(txs[hash][1]);
            var remainingStaked = 0;
            var totalUnstaked = 0;
            var w = wallets[from];
            
            //for each stake, check to see if remaining stakes are net positive
            for(var h of Object.keys(w)){
                if(w[h][4]<0){
                    totalUnstaked += w[h][4];
                }
                else if(w[h][1] > sNum){
                    remainingStaked += w[h][4];
                }
            }
            var netStaked = remainingStaked - totalUnstaked;
            
            //if net positive (less unstakes than stakes)
            if(netStaked >= 0){
                //and if there are sufficient remaning nfts
                if(remainingNfts > txs[hash][4]){
                    //assign full value for nfts and decrement remaining
                    txs[hash][5] = txs[hash][4];
                    wallets[from][hash][5] = txs[hash][4];
                    remainingNfts -= txs[hash][4];
                }
                //else if there arent enough remaining nfts
                else if (remainingNfts > 0) {
                    //claim the remainin nfts
                    txs[hash][5] = remainingNfts;
                    wallets[from][hash][5] = remainingNfts;
                    remainingNfts = 0;
                }
                //for all future stakes there will be no nfts assigned
                else{
                    txs[hash][5] = 0;
                    wallets[from][hash][5] = 0;
                }
            }
            //if net negative but partial nfts are owed
            else if (netStaked + txs[hash][4] >= 0){
                var owedNfts = netStaked + txs[hash][4];
                //and if there are sufficient remaning nfts
                if(remainingNfts > owedNfts){
                    //assign full value for nfts and decrement remaining
                    txs[hash][5] = owedNfts;
                    wallets[from][hash][5] = owedNfts;
                    remainingNfts -= owedNfts;
                }
                //else if there arent enough remaining nfts
                else if (remainingNfts - owedNfts >= 0) {
                    //claim the remainin nfts
                    txs[hash][5] = remainingNfts;
                    wallets[from][hash][5] = remainingNfts;
                    remainingNfts = 0;
                }
                //for all future stakes there will be no nfts assigned
                else{
                    txs[hash][5] = 0;
                    wallets[from][hash][5] = 0;
                }
            }
            //if you have unstaked enough to no longer be owed nfts.
            else if (remainingNfts > txs[hash][4]){
                txs[hash][5] = 0;
                wallets[from][hash][5] = 0;
            }
        }
        //convert dictionary to string for display
        var outputString = "Wallet\tStake\tHash\tvalue\tnfts\tassigned\n";
        for (var hash of Object.keys(txs)){
            if(txs[hash][1]<0){
                continue; //Don't display unstakes
            }
            outputString += txs[hash][0].slice(0,6);
            outputString += "\t";
            for(var i=1;i<6;i++){
                if(i==3){
                    var v = Math.round(txs[hash][i]);
                    outputString += v.toString();
                    outputString += "\t";
                    if(v.toString().length < 4){
                        outputString += "\t";
                    }
                }
                else if(i==2){
                    outputString += hash.slice(0,10);
                    outputString += "\t";
                }
                else{
                    outputString += txs[hash][i].toString();
                    outputString += "\t";
                }
            }
            outputString += "\n";
        }

        this.setState({ api: outputString, loading: false });
                  
    }
    
        render () {

            if (this.state.loading) {
              return (
              <div>
                  <br></br>
                  <div>loading . . .</div>
              </div>
              );
              
            }

            return (
                <div>
                    <h4>Firefund NFT allocation</h4>
                    <br></br>
                    <div>{this.state.api}</div>

                </div>
              
            );
          }  
}