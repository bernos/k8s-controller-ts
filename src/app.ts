import * as k8s from '@kubernetes/client-node';
import { Controller, WatchEvent  } from './controller';

class MyController extends Controller {
  protected readonly test:String = "foobar";

  protected async init(): Promise<void> {

  // const response = await this.fetch("https://127.0.0.1:60949/apis/networking.istio.io/v1beta1/namespaces/tenant-knowledge-graph-nerd-development/serviceentries/knowledge-graph-nerd-gantry");

  // const data = await response.json()

  // console.log(data)

    
    this.watchV1Pods(this.watchEventHandlerFromMethod(this.handlePodWatchEvent));
    this.watchV1Namespaces(this.watchEventHandlerFromMethod(this.handleNamespaceWatchEvent));
  }

  private async handleNamespaceWatchEvent(e: WatchEvent<k8s.V1Namespace>): Promise<void> {
    console.log(this.test);
    if (e.phase === 'ADDED') {
      console.log('new NS object:');
    } else if (e.phase === 'MODIFIED') {
      console.log('changed NS object:');
    } else if (e.phase === 'DELETED') {
      console.log('deleted NS object:');
    } else {
      console.log('unknown type: ' + e.phase);
    }
  }

  private async handlePodWatchEvent(e: WatchEvent<k8s.V1Pod>): Promise<void> {
    // console.log(this.test);
    // if (e.phase === 'ADDED') {
    //   console.log('new POD object:');
    // } else if (e.phase === 'MODIFIED') {
    //   console.log('changed POD object:');
    // } else if (e.phase === 'DELETED') {
    //   console.log('deleted POD object:');
    // } else {
    //   console.log('unknown type: ' + e.phase);
    // }
    // console.log(e.resource);
    // console.log(this.resourceApiUrl(e.meta))

    const wantQosClass = "poop";
    const qosClass = e.resource.status?.qosClass;

    console.log(`== ${e.meta.namespace}/${e.meta.name}`);
    console.log(`qosClass is ${qosClass}`)

    if (qosClass !== wantQosClass) {
      console.log(`setting qosClass to ${wantQosClass}`);
      
      try {
        const response = await this.patchResourceStatus(e.meta, {
          qosClass: wantQosClass
        });
        console.log(response);
        
      } catch (err: any) {
        console.log("!!!ERR")
        console.log(`ERR: ${err.statusCode}, ${err.statusMessage}`)
      }
    }
  }
}

const main = async () => {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  const exit = (reason: string, code?: number | undefined) => {
    console.log(`Exit: ${reason}`);
    controller.stop();
    process.exit(code);
  };

  process
    .on('SIGTERM', () => exit('SIGTERM'))
    .on('SIGINT', () => exit('SIGINT'));

  const controller = new MyController(kc);

  await controller.start(err => {
    exit(err, err ? 1 : 0);
  });
  
};

main();





