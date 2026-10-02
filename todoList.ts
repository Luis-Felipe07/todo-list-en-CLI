
type taskStatus =
   | 'PENDING'      
   | 'IN_PROGRESS'  
   | 'UNDER_REVIEW' 
   | 'BLOCKED'    
   | 'COMPLETED'   
   | 'CANCELLED'   

enum Priority{
    low,        
    average,
    high,
    criticism
}


//esto representa un string no vacio 
export type NonEmptyString = string & { readonly __brand: 'NonEmptyString'   };


//valido en tiempo de ejecucion que el valor no sea vacio 
export function NonEmptyString(val: string): NonEmptyString{
        if(!val || val.trim().length === 0){
            throw new Error('El valor no puede ser vacio')
        }

        return val as NonEmptyString;
}

//alias especificos

export type taskID = NonEmptyString & {readonly __taskID: unique symbol}; 
export type Tag = NonEmptyString & { readonly __etiqueta: unique symbol};

//y voy a necesitar algo para crear tareas con id de string 

export function createTaskID(id: string): taskID{
    return NonEmptyString(id) as taskID;
}

export function createTag(tag: string): Tag{
    return NonEmptyString(tag) as Tag;
}

//Creo la interfaz para tarea
export interface StateChange{
   previousState: taskStatus;
    conditionNew: taskStatus;
    date: Date;
}


//ahora si la interfaz

export interface task {
    readonly id: taskID;
    title: NonEmptyString;
    description?: string | null;
    state: taskStatus;
    priority: Priority;
    assignedTo: string;
    tags: Tag;
    readonly creationDate: Date;
    UpdateDate: Date
    statusHistory: StateChange[];
    
}

/*
---------------------------------------------------
---------------------------------------------------
---------------------------------------------------
         ANTES DE AQUI CAMBIE EL CODIGO ANTERIOR
___________________________________________________
___________________________________________________
___________________________________________________
*/



const Allowed_transitions: Record<taskStatus, ReadonlySet<taskStatus>> = {
    
    PENDING: new Set(['IN_PROGRESS', 'CANCELLED']),
    IN_PROGRESS: new Set(['UNDER_REVIEW','BLOCKED','CANCELLED']),
    BLOCKED: new Set(['IN_PROGRESS','CANCELLED']),
    UNDER_REVIEW: new Set(['IN_PROGRESS','COMPLETED','CANCELLED']),
    COMPLETED: new Set(),
    CANCELLED:  new Set(),
};

/*
FUNCION esTransicionValida(actual: EstadoTarea, siguiente: EstadoTarea) -> BOOLEANO
    RETORNAR siguiente PERTENECE_A TransicionesPermitidas[actual]
FIN FUNCION

*/

function isValidTransition(current: taskStatus, after: taskStatus ): boolean {
    return Allowed_transitions[current].has(after);
}

//representa estados de exito o error que implementare mas adelante
type Result<T, E> = 
  | { status: 'Exit'; value: T }
  | { status: 'Error'; error: E };


/*

ESTRUCTURA Exito<T> { valor: T }
ESTRUCTURA Error<E>  { error: E }


*/
export const Exit = <T>(value: T) => ({
    ok: true,
    value
} )

export const theError = <E>(value: E) => ({
    ok: true,
    value
})

enum taskError{
    INVALID_TITLE = "el titulo es invalido o esta vacio",
    TRANSITION_NOT_ALLOWED = "No se Permite La transicion",
    TASK_NOT_FOUND = "error, no se encontro la tarea",
    DUPLICATED_ID = "id duplicado"
}

interface taskRepository{
    getForID(id: taskID ) : Result<task, taskError>;
    save(task: task) : Result<task, taskError>;
    listAll(): task[];
    delete(id: taskID): Result<void, taskError>;
}



class InMemoryRepository implements taskRepository {

    private tasks: Map<taskID, task> = new Map();
    

    /*Busco una tarea utilizando su ID. Si no existe una tarea con ese ID,
     devuelvo un resultado de error indicando error. Si existe, devuelvo
      un resultado exitoso con  la tarea encontrada */
    getForID(id: taskID): Result<task, taskError> {
        
            if(!this.tasks.has(id)){
                let resultError = Error(taskError.TASK_NOT_FOUND);
                
                let err = Object;
                return err(resultError)
            }
        return {
            status: 'Exit' ,
            value:  this.tasks.get(id)!
        };
    }

    save(task: task): Result<task, taskError> {
       // let saveTask: object;
        
        if(!this.tasks.has(task.id)){
                let resultError = Error(taskError.TASK_NOT_FOUND);
                
                let err = Object;
                return err(resultError)
            }


       
       
        this.tasks.set(task.id, task)
      

       
        return   {status: 'Exit', value: task};
    }

    listAll(): task[] {
        return Object.values(this.tasks)
    }

    delete(id: taskID): Result<void, taskError> {
        if(!this.tasks.has(id)){
             let isError = Error(taskError.TASK_NOT_FOUND);
                
                let error = Object;
                return error(isError)
        }

        this.tasks.delete(id);

        return {status: "Exit", value: void("Se elimino la tarea correctamente")};
    }
        
}


//state: taskStatus;
function createTask(repo: taskRepository,
                    id: string, 
                    title: string,
                    priority: Priority,
                    assignedTo: string,
                    tags: Tag,
                    state: taskStatus,
                    


): Result<task, taskError>{
  
    if(title.trim() == ""){
       
    return{
        status: 'Error',
        error: taskError.INVALID_TITLE
    }
    } 
    
    const currentId = createTaskID(id);
    
    if(repo.getForID(currentId).status === 'Exit'){
        return{
            status: 'Error',
            error: taskError.DUPLICATED_ID
        }
    }

    
    // NonEmptyString(title);

    const newTask: task = {
        id: createTaskID(id),
         title: NonEmptyString(title),
         description: null,
        priority: priority,
        assignedTo: assignedTo,
        state: state,
        tags: tags,
        creationDate: new Date(),
        UpdateDate: new Date(),
        statusHistory: []
    }
   
    return {
        status: 'Exit',
        value: newTask
    }
}


function changeStatus(repo: taskRepository, 
                      id: taskID,
                      newState: taskStatus,
                      reason?: string

                       
): Result<task, taskError>{
    
   const taskId = createTaskID(id);

        const foundResult = repo.getForID(taskId);
       // const task = searchResult.value 
    
   

    // verifica que se encuentre el id o que sea real
    if(foundResult.status === 'Error'){
       
        return{
            status: 'Error',
            error: taskError.TASK_NOT_FOUND
        }

        
    }
    
    const task = foundResult.value;

    //si la transicion no es valida retorno error 
    if(!isValidTransition(task.state, newState)){
        return{
            status: 'Error',
            error: taskError.TRANSITION_NOT_ALLOWED

        }
    }


    // Registro el cambio de estado de la tarea, 
    // guardando el estado anterior, 
    // el nuevo estado y la fecha en que ocurrio
    const change: StateChange = {
       previousState: task.state,
       conditionNew: newState,
       date:  new Date(),
      // reason: reason
    }
    

    const taskUpdate = {...task,
                        State: newState,
                        updateDate: new Date(),
                        statusHistory: [...task.statusHistory, change] 
                        

    }

    return repo.save(taskUpdate)

}

type predicateTask = (task: task) => boolean;

//esta funcion filtra las tareas por estados
function forState(state: taskStatus) : predicateTask{
    return (t: task) => t.state === state;
}

//filtrado por prioridad 
function byPriority(priority: Priority): predicateTask{
    return (t: task) => t.priority === priority;
}

//por asigancion 
function byAssignment(user: string): predicateTask{
    return (t: task) => t.assignedTo == user;
}

function byTag(tag: Tag): predicateTask{
    return (t: task) => t.tags.includes(tag);
}

function Combine(predicates: predicateTask[] ): predicateTask{
    // Retorna un nuevo predicado que evalúa una tarea 't': .every() actúa como un "Y" lógico, 
    // asegurando que la tarea cumpla con TODOS los predicados de la lista.
    return (t: task) => predicates.every(predicates => predicates(t));
}


function filterTasks(repo: taskRepository, predicate: predicateTask) : task[]{
    return repo.listAll().filter(predicate);
}


// analiticas

interface Analytics {
    totalTask: number,
    forState: Map<taskStatus, number>,
    forPriority: Map<Priority, number>
    averageResolutionTime: number,
    expiredOrBlocked: number
}

//calcular analiticas 
function calculateAnalytics(repo: taskRepository): Analytics{
   const  tasks = repo.listAll();

   const conuntByState = tasks.reduce((cbs, t) => {
        cbs.set(t.state,(cbs.get(t.state) || 0 ) +1 );
        return cbs;
   }, new Map<taskStatus, number>());


  const countByPriority = tasks.reduce((cbp, t) => {
    cbp.set(t.priority, (cbp.get(t.priority) || 0 ) +1);
    return cbp;
  }, new Map<Priority, number>())
    
  const complete = tasks.filter((t) => t.state === 'COMPLETED' )
  const time = complete.map(t => (t.UpdateDate.getTime() - t.creationDate.getTime()))

  
  //uso operdaor ternario para sacar el promedio de tiempos de las tareas
  const average  = time.length > 0 ? time.reduce((avg, t) => avg + t, 0) / time.length : 0;

  const blocked = tasks.filter(t => t.state === 'BLOCKED').length
 
  
  const finalReturn = {
    totalTask: tasks.length,
    forState: conuntByState,
    forPriority: countByPriority,
    averageResolutionTime: average,
    expiredOrBlocked: blocked
  }
  return  finalReturn;



}

    type Command = 
    | {tipe: "create"; title: string; id: string; priority: Priority; assignedTo: string, tags: Tag; state: taskStatus}
    | {tipe: "changeStatus"; id: taskID; newState: taskStatus; reason: string  }    
    | {tipe: "filter"; criterion: predicateTask[]}
    | {tipe: "analytics"}
    


    function excuteCommand( repo: taskRepository, command: Command): string{
        switch(command.tipe){
            case "create":
           const result = createTask(repo, command.title, command.id, command.priority, command.assignedTo, command.tags, command.state )
           
            if(result.status === 'Exit'){
                return "Tarea Creada con Exito " + result.value.id;
            }else{
                return "Error al crear la tarea " + result.error
            }

            case "changeStatus":
                const result2 = changeStatus(repo, command.id, command.newState, command.reason)
                if(result2.status === 'Exit'){
                    return `Se actualizó el estado de la tarea ${result2.value.id} a ${result2.value.state} correctamente`
                }else{
                    return "Error al actualizar la tarea " + result2.error
                }

                case "filter":
                    const list = filterTasks(repo, Combine(command.criterion) )
                  
                    if(list.length === 0){
                        return "No se encontraron tareas con ese criterio"
                    }
                    return list
                        .map(t => `- [${t.id}] ${t.title} (Estado: ${t.state}, Prioridad: ${t.priority})`)
                        .join('\n');
                case "analytics":
                   const data = calculateAnalytics(repo);
                  if(data.totalTask === 0  ){
                        return "No hay analiticas disponibles"
                  }
                /*
                let  finalData: object;
                finalData = {
                    data: data.totalTask,
                    data2: data.forState,
                    data3: data.forPriority,
                    data4: data.averageResolutionTime,
                    data5: data.expiredOrBlocked
                }
                  */
                return `Total Tareas: ${data.totalTask} Estados ${data.forState} Prioridades ${data.forPriority} Promedio de resolucion ${data.averageResolutionTime} Expiradas o bloqueadas {data.expiredOrBlocked}`
                
    }
}